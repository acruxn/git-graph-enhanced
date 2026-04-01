use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use tempfile::TempDir;

fn spawn_server() -> std::process::Child {
    Command::new(env!("CARGO_BIN_EXE_git-graph-server"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("failed to spawn server")
}

fn send_recv(child: &mut std::process::Child, request: &str) -> serde_json::Value {
    let stdin = child.stdin.as_mut().unwrap();
    writeln!(stdin, "{request}").unwrap();
    stdin.flush().unwrap();

    let stdout = child.stdout.as_mut().unwrap();
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    reader.read_line(&mut line).unwrap();
    serde_json::from_str(&line).unwrap()
}

fn init_test_repo(dir: &std::path::Path) {
    Command::new("git")
        .args(["init"])
        .current_dir(dir)
        .output()
        .unwrap();
    Command::new("git")
        .args(["config", "user.email", "t@t.com"])
        .current_dir(dir)
        .output()
        .unwrap();
    Command::new("git")
        .args(["config", "user.name", "T"])
        .current_dir(dir)
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "--allow-empty", "-m", "test"])
        .current_dir(dir)
        .output()
        .unwrap();
}

fn init_test_repo_with_file(dir: &std::path::Path) {
    init_test_repo(dir);
    std::fs::write(dir.join("test.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir)
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "add file"])
        .current_dir(dir)
        .output()
        .unwrap();
}

#[test]
fn test_initialize() {
    let mut child = spawn_server();
    let resp = send_recv(
        &mut child,
        r#"{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1}}"#,
    );
    assert_eq!(resp["result"]["protocolVersion"], 1);
    child.kill().ok();
}

#[test]
fn test_method_not_found() {
    let mut child = spawn_server();
    let resp = send_recv(
        &mut child,
        r#"{"jsonrpc":"2.0","id":1,"method":"bogus","params":{}}"#,
    );
    assert_eq!(resp["error"]["code"], -32601);
    child.kill().ok();
}

#[test]
fn test_get_commits_via_rpc() {
    let dir = TempDir::new().unwrap();
    init_test_repo(dir.path());

    let mut child = spawn_server();
    let req = format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"getCommits","params":{{"repoPath":"{}","maxCount":10}}}}"#,
        dir.path().display()
    );
    let resp = send_recv(&mut child, &req);
    let commits = resp["result"]["commits"].as_array().unwrap();
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0]["message"], "test");
    child.kill().ok();
}

#[test]
fn test_parse_error() {
    let mut child = spawn_server();
    let resp = send_recv(&mut child, "not json at all");
    assert_eq!(resp["error"]["code"], -32700);
    child.kill().ok();
}

#[test]
fn test_get_branches_via_rpc() {
    let dir = TempDir::new().unwrap();
    init_test_repo(dir.path());
    let mut child = spawn_server();
    let req = format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"getBranches","params":{{"repoPath":"{}"}}}}"#,
        dir.path().display()
    );
    let resp = send_recv(&mut child, &req);
    assert!(resp["result"]["branches"].is_array());
    child.kill().ok();
}

#[test]
fn test_get_tags_via_rpc() {
    let dir = TempDir::new().unwrap();
    init_test_repo(dir.path());
    Command::new("git")
        .args(["tag", "v1.0"])
        .current_dir(dir.path())
        .output()
        .unwrap();
    let mut child = spawn_server();
    let req = format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"getTags","params":{{"repoPath":"{}"}}}}"#,
        dir.path().display()
    );
    let resp = send_recv(&mut child, &req);
    let tags = resp["result"]["tags"].as_array().unwrap();
    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0]["name"], "v1.0");
    child.kill().ok();
}

#[test]
fn test_get_graph_via_rpc() {
    let mut child = spawn_server();
    let resp = send_recv(
        &mut child,
        r#"{"jsonrpc":"2.0","id":1,"method":"getGraph","params":{"commits":[{"id":"a","parentIds":["b"]},{"id":"b","parentIds":[]}]}}"#,
    );
    let nodes = resp["result"]["nodes"].as_array().unwrap();
    assert_eq!(nodes.len(), 2);
    assert!(resp["result"]["edges"].is_array());
    child.kill().ok();
}

#[test]
fn test_get_commit_detail_via_rpc() {
    let dir = TempDir::new().unwrap();
    init_test_repo(dir.path());
    let mut child = spawn_server();
    let req = format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"getCommits","params":{{"repoPath":"{}","maxCount":1}}}}"#,
        dir.path().display()
    );
    let resp = send_recv(&mut child, &req);
    let commit_id = resp["result"]["commits"][0]["id"]
        .as_str()
        .unwrap()
        .to_string();

    let req2 = format!(
        r#"{{"jsonrpc":"2.0","id":2,"method":"getCommitDetail","params":{{"repoPath":"{}","commitId":"{}"}}}}"#,
        dir.path().display(),
        commit_id
    );
    let resp2 = send_recv(&mut child, &req2);
    assert!(resp2["result"]["commit"].is_object());
    assert!(resp2["result"]["files"].is_array());
    child.kill().ok();
}

#[test]
fn test_search_via_rpc() {
    let dir = TempDir::new().unwrap();
    init_test_repo(dir.path());
    let mut child = spawn_server();
    let req = format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"search","params":{{"repoPath":"{}","query":"test","type":"message"}}}}"#,
        dir.path().display()
    );
    let resp = send_recv(&mut child, &req);
    assert!(resp["result"]["results"].is_array());
    child.kill().ok();
}

#[test]
fn test_get_file_content_via_rpc() {
    let dir = TempDir::new().unwrap();
    init_test_repo_with_file(dir.path());
    let mut child = spawn_server();
    let req = format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"getCommits","params":{{"repoPath":"{}","maxCount":1}}}}"#,
        dir.path().display()
    );
    let resp = send_recv(&mut child, &req);
    let commit_id = resp["result"]["commits"][0]["id"]
        .as_str()
        .unwrap()
        .to_string();

    let req2 = format!(
        r#"{{"jsonrpc":"2.0","id":2,"method":"getFileContent","params":{{"repoPath":"{}","commitId":"{}","filePath":"test.txt"}}}}"#,
        dir.path().display(),
        commit_id
    );
    let resp2 = send_recv(&mut child, &req2);
    assert_eq!(resp2["result"]["content"], "hello");
    child.kill().ok();
}

#[test]
fn test_get_repo_state_via_rpc() {
    let dir = TempDir::new().unwrap();
    init_test_repo(dir.path());
    let mut child = spawn_server();
    let req = format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"getRepoState","params":{{"repoPath":"{}"}}}}"#,
        dir.path().display()
    );
    let resp = send_recv(&mut child, &req);
    assert_eq!(resp["result"]["state"], "clean");
    child.kill().ok();
}

#[test]
fn test_get_stashes_via_rpc() {
    let dir = TempDir::new().unwrap();
    init_test_repo(dir.path());
    let mut child = spawn_server();
    let req = format!(
        r#"{{"jsonrpc":"2.0","id":1,"method":"getStashes","params":{{"repoPath":"{}"}}}}"#,
        dir.path().display()
    );
    let resp = send_recv(&mut child, &req);
    assert!(resp["result"]["stashes"].is_array());
    child.kill().ok();
}

#[test]
fn test_missing_repo_path() {
    let mut child = spawn_server();
    let resp = send_recv(
        &mut child,
        r#"{"jsonrpc":"2.0","id":1,"method":"getCommits","params":{}}"#,
    );
    assert_eq!(resp["error"]["code"], -32602);
    child.kill().ok();
}

#[test]
fn test_shutdown_notification() {
    let mut child = spawn_server();
    send_recv(
        &mut child,
        r#"{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":1}}"#,
    );
    let stdin = child.stdin.as_mut().unwrap();
    writeln!(stdin, r#"{{"jsonrpc":"2.0","method":"shutdown"}}"#).unwrap();
    stdin.flush().unwrap();
    let status = child.wait().unwrap();
    assert!(status.success());
}
