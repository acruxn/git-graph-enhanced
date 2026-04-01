use std::process::Command;
use tempfile::TempDir;

fn init_repo(dir: &std::path::Path) {
    Command::new("git")
        .args(["init"])
        .current_dir(dir)
        .output()
        .unwrap();
    Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(dir)
        .output()
        .unwrap();
    Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(dir)
        .output()
        .unwrap();
}

fn commit(dir: &std::path::Path, msg: &str) {
    Command::new("git")
        .args(["commit", "--allow-empty", "-m", msg])
        .current_dir(dir)
        .output()
        .unwrap();
}

fn branch(dir: &std::path::Path, name: &str) {
    Command::new("git")
        .args(["branch", name])
        .current_dir(dir)
        .output()
        .unwrap();
}

fn tag(dir: &std::path::Path, name: &str) {
    Command::new("git")
        .args(["tag", name])
        .current_dir(dir)
        .output()
        .unwrap();
}

fn tag_annotated(dir: &std::path::Path, name: &str, msg: &str) {
    Command::new("git")
        .args(["tag", "-a", name, "-m", msg])
        .current_dir(dir)
        .output()
        .unwrap();
}

#[test]
fn test_list_commits_basic() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    commit(dir.path(), "first");
    commit(dir.path(), "second");
    commit(dir.path(), "third");

    let (commits, has_more) =
        git_graph_core::commit::list_commits(dir.path(), 0, 10, "date").unwrap();
    assert_eq!(commits.len(), 3);
    assert!(!has_more);
    assert_eq!(commits[0].message, "third");
    assert_eq!(commits[2].message, "first");
}

#[test]
fn test_list_commits_pagination() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    for i in 0..5 {
        commit(dir.path(), &format!("commit {i}"));
    }

    let (page1, has_more) = git_graph_core::commit::list_commits(dir.path(), 0, 2, "date").unwrap();
    assert_eq!(page1.len(), 2);
    assert!(has_more);

    let (page2, has_more) = git_graph_core::commit::list_commits(dir.path(), 2, 2, "date").unwrap();
    assert_eq!(page2.len(), 2);
    assert!(has_more);

    let (page3, _) = git_graph_core::commit::list_commits(dir.path(), 4, 2, "date").unwrap();
    assert_eq!(page3.len(), 1);
}

#[test]
fn test_list_branches() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    commit(dir.path(), "init");
    branch(dir.path(), "feature");

    let branches = git_graph_core::branch::list_branches(dir.path()).unwrap();
    assert!(branches.len() >= 2);
    assert!(branches.iter().any(|b| b.is_head));
}

#[test]
fn test_list_tags() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    commit(dir.path(), "init");
    tag(dir.path(), "v1.0");
    tag_annotated(dir.path(), "v2.0", "release 2");

    let tags = git_graph_core::tag::list_tags(dir.path()).unwrap();
    assert_eq!(tags.len(), 2);
    let v1 = tags.iter().find(|t| t.name == "v1.0").unwrap();
    assert!(!v1.is_annotated);
    let v2 = tags.iter().find(|t| t.name == "v2.0").unwrap();
    assert!(v2.is_annotated);
    assert_eq!(v2.message.as_deref(), Some("release 2"));
}

#[test]
fn test_search_by_message() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    commit(dir.path(), "add feature X");
    commit(dir.path(), "fix bug Y");
    commit(dir.path(), "add feature Z");

    let results =
        git_graph_core::search::search_commits(dir.path(), "feature", "message", 10).unwrap();
    assert_eq!(results.len(), 2);
}

#[test]
fn test_search_by_author() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    commit(dir.path(), "something");

    let results = git_graph_core::search::search_commits(dir.path(), "Test", "author", 10).unwrap();
    assert_eq!(results.len(), 1);
}

#[test]
fn test_empty_repo() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    let result = git_graph_core::commit::list_commits(dir.path(), 0, 10, "date");
    assert!(result.is_err());
}

#[test]
fn test_repo_not_found() {
    let result =
        git_graph_core::commit::list_commits(std::path::Path::new("/nonexistent"), 0, 10, "date");
    assert!(result.is_err());
}

#[test]
fn test_get_commit_detail() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    std::fs::write(dir.path().join("file.txt"), "hello").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    commit(dir.path(), "add file");

    let (commits, _) = git_graph_core::commit::list_commits(dir.path(), 0, 1, "date").unwrap();
    let (detail, files) =
        git_graph_core::diff::get_commit_detail(dir.path(), &commits[0].id).unwrap();
    assert_eq!(detail.message, "add file");
    assert!(files
        .iter()
        .any(|f| f.path == "file.txt" && f.status == "added"));
}

#[test]
fn test_get_file_content() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    std::fs::write(dir.path().join("hello.txt"), "world").unwrap();
    Command::new("git")
        .args(["add", "."])
        .current_dir(dir.path())
        .output()
        .unwrap();
    commit(dir.path(), "add hello");

    let (commits, _) = git_graph_core::commit::list_commits(dir.path(), 0, 1, "date").unwrap();
    let content =
        git_graph_core::content::get_file_content(dir.path(), &commits[0].id, "hello.txt").unwrap();
    assert_eq!(content, "world");
}

#[test]
fn test_list_commits_topo_sort() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    commit(dir.path(), "first");
    commit(dir.path(), "second");
    let (commits, _) = git_graph_core::commit::list_commits(dir.path(), 0, 10, "topo").unwrap();
    assert_eq!(commits.len(), 2);
}

#[test]
fn test_filter_by_author() {
    use git_graph_core::commit::{Author, Commit};
    use git_graph_core::filter::filter_by_author;
    let commits = vec![
        Commit {
            id: "a".into(),
            short_id: "a".into(),
            message: "".into(),
            body: "".into(),
            author: Author {
                name: "Alice".into(),
                email: "alice@test.com".into(),
            },
            committer: Author {
                name: "Alice".into(),
                email: "alice@test.com".into(),
            },
            parent_ids: vec![],
            timestamp: 0,
            gpg_status: None,
            gpg_signer: None,
        },
        Commit {
            id: "b".into(),
            short_id: "b".into(),
            message: "".into(),
            body: "".into(),
            author: Author {
                name: "Bob".into(),
                email: "bob@test.com".into(),
            },
            committer: Author {
                name: "Bob".into(),
                email: "bob@test.com".into(),
            },
            parent_ids: vec![],
            timestamp: 0,
            gpg_status: None,
            gpg_signer: None,
        },
    ];
    let indices = filter_by_author(&commits, "alice");
    assert_eq!(indices, vec![0]);
}

#[test]
fn test_unsigned_commit_gpg_status_none() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());
    commit(dir.path(), "unsigned commit");

    let (commits, _) = git_graph_core::commit::list_commits(dir.path(), 0, 1, "date").unwrap();
    let (detail, _) = git_graph_core::diff::get_commit_detail(dir.path(), &commits[0].id).unwrap();
    assert_eq!(detail.gpg_status.as_deref(), Some("none"));
    assert!(detail.gpg_signer.is_none());
}

#[test]
fn test_mailmap_resolves_author() {
    let dir = TempDir::new().unwrap();
    init_repo(dir.path());

    // Configure git to commit as "Old Name"
    Command::new("git")
        .args(["config", "user.name", "Old Name"])
        .current_dir(dir.path())
        .output()
        .unwrap();
    Command::new("git")
        .args(["config", "user.email", "old@test.com"])
        .current_dir(dir.path())
        .output()
        .unwrap();
    commit(dir.path(), "mailmap test commit");

    // Add .mailmap that maps Old Name → New Name
    std::fs::write(
        dir.path().join(".mailmap"),
        "New Name <new@test.com> Old Name <old@test.com>\n",
    )
    .unwrap();

    let (commits, _) = git_graph_core::commit::list_commits(dir.path(), 0, 10, "date").unwrap();
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0].author.name, "New Name");
    assert_eq!(commits[0].author.email, "new@test.com");
}
