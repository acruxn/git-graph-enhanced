use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use crate::repo::open_repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub is_remote: bool,
    pub is_head: bool,
    pub commit_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upstream: Option<String>,
}

pub fn list_branches(repo_path: &Path) -> CoreResult<Vec<Branch>> {
    let repo = open_repo(repo_path)?;

    let head_id = repo.head_id().ok().map(|id| id.detach());

    let mut branches = Vec::new();

    if let Ok(refs) = repo.references() {
        if let Ok(local) = refs.local_branches() {
            for reference in local.flatten() {
                let name = reference
                    .name()
                    .as_bstr()
                    .to_string()
                    .strip_prefix("refs/heads/")
                    .unwrap_or(&reference.name().as_bstr().to_string())
                    .to_string();
                let target = reference.id().detach();
                let is_head = head_id.as_ref() == Some(&target);
                branches.push(Branch {
                    name,
                    is_remote: false,
                    is_head,
                    commit_id: target.to_string(),
                    upstream: None,
                });
            }
        }

        if let Ok(remote) = refs.remote_branches() {
            for reference in remote.flatten() {
                let name = reference
                    .name()
                    .as_bstr()
                    .to_string()
                    .strip_prefix("refs/remotes/")
                    .unwrap_or(&reference.name().as_bstr().to_string())
                    .to_string();
                let target = reference.id().detach();
                branches.push(Branch {
                    name,
                    is_remote: true,
                    is_head: false,
                    commit_id: target.to_string(),
                    upstream: None,
                });
            }
        }
    }

    Ok(branches)
}

pub fn get_remote_url(repo_path: &Path, remote_name: &str) -> CoreResult<String> {
    let repo = open_repo(repo_path)?;
    let remote = repo
        .find_remote(gix::bstr::BStr::new(remote_name.as_bytes()))
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
    let url =
        remote
            .url(gix::remote::Direction::Fetch)
            .ok_or_else(|| CoreError::InvalidRevision {
                rev: format!("no URL for remote '{remote_name}'"),
            })?;
    Ok(url.to_bstring().to_string())
}

pub fn delete_branch(repo_path: &Path, branch_name: &str) -> CoreResult<()> {
    let repo = open_repo(repo_path)?;
    let ref_name = format!("refs/heads/{branch_name}");
    let reference = repo
        .find_reference(&ref_name)
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
    reference
        .delete()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
    Ok(())
}
