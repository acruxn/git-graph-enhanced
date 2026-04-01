use std::path::Path;

use crate::error::{CoreError, CoreResult};

pub fn open_repo(path: &Path) -> CoreResult<gix::Repository> {
    gix::open(path).map_err(|_| CoreError::RepoNotFound {
        path: path.to_path_buf(),
    })
}

pub fn get_repo_state(repo_path: &Path) -> CoreResult<String> {
    let repo = open_repo(repo_path)?;
    let git_dir = repo.git_dir();
    if git_dir.join("MERGE_HEAD").exists() {
        return Ok("merging".into());
    }
    if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        return Ok("rebasing".into());
    }
    if git_dir.join("CHERRY_PICK_HEAD").exists() {
        return Ok("cherry-picking".into());
    }
    Ok("clean".into())
}

pub fn abort_operation(repo_path: &Path) -> CoreResult<()> {
    let state = get_repo_state(repo_path)?;
    let args: &[&str] = match state.as_str() {
        "merging" => &["merge", "--abort"],
        "rebasing" => &["rebase", "--abort"],
        "cherry-picking" => &["cherry-pick", "--abort"],
        _ => return Ok(()),
    };
    let output = std::process::Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()?;
    if !output.status.success() {
        return Err(CoreError::InvalidRevision {
            rev: String::from_utf8_lossy(&output.stderr).to_string(),
        });
    }
    Ok(())
}
