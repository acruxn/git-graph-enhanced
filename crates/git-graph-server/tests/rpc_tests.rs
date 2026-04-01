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
    Command::new("git")
        .args(["init"])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["config", "user.email", "t@t.com"])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["config", "user.name", "T"])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["commit", "--allow-empty", "-m", "test"])
        .current_dir(dir.path())
        .output()
        .unwrap();

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
