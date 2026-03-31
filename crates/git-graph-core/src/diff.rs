use std::path::Path;

use gix::object::tree::diff::ChangeDetached;
use serde::{Deserialize, Serialize};

use crate::commit::{Author, Commit};
use crate::error::{CoreError, CoreResult};
use crate::repo::open_repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
}

pub fn get_commit_detail(
    repo_path: &Path,
    commit_id: &str,
) -> CoreResult<(Commit, Vec<FileDiff>)> {
    let repo = open_repo(repo_path)?;
    let oid = gix::ObjectId::from_hex(commit_id.as_bytes())
        .map_err(|_| CoreError::InvalidRevision { rev: commit_id.to_owned() })?;

    let object = repo
        .find_object(oid)
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
    let commit_obj = object.into_commit();
    let decoded = commit_obj
        .decode()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let author_sig = decoded
        .author()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
    let committer_sig = decoded
        .committer()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
    let timestamp = committer_sig.time().map(|t| t.seconds).unwrap_or(0);

    let hex = oid.to_string();
    let short = hex[..7.min(hex.len())].to_string();
    let msg: &str = std::str::from_utf8(decoded.message).unwrap_or("");
    let (message, body) = match msg.split_once('\n') {
        Some((first, rest)) => (first.to_owned(), rest.trim().to_owned()),
        None => (msg.to_owned(), String::new()),
    };

    let commit = Commit {
        id: hex,
        short_id: short,
        message,
        body,
        author: Author {
            name: author_sig.name.to_string(),
            email: author_sig.email.to_string(),
        },
        committer: Author {
            name: committer_sig.name.to_string(),
            email: committer_sig.email.to_string(),
        },
        parent_ids: decoded.parents().map(|p| p.to_string()).collect(),
        timestamp,
    };

    // Diff against first parent (or empty tree for root commits)
    let new_tree = commit_obj
        .tree()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let parent_tree = decoded
        .parents()
        .next()
        .and_then(|pid| repo.find_object(pid).ok())
        .and_then(|obj| obj.into_commit().tree().ok());

    let changes = match &parent_tree {
        Some(pt) => repo.diff_tree_to_tree(Some(pt), Some(&new_tree), None),
        None => repo.diff_tree_to_tree(None, Some(&new_tree), None),
    }
    .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let files = changes
        .into_iter()
        .filter_map(|change| match change {
            ChangeDetached::Addition { location, .. } => Some(FileDiff {
                path: location.to_string(),
                old_path: None,
                status: "added".into(),
                additions: 0,
                deletions: 0,
            }),
            ChangeDetached::Deletion { location, .. } => Some(FileDiff {
                path: location.to_string(),
                old_path: None,
                status: "deleted".into(),
                additions: 0,
                deletions: 0,
            }),
            ChangeDetached::Modification { location, .. } => Some(FileDiff {
                path: location.to_string(),
                old_path: None,
                status: "modified".into(),
                additions: 0,
                deletions: 0,
            }),
            ChangeDetached::Rewrite {
                source_location,
                location,
                ..
            } => Some(FileDiff {
                path: location.to_string(),
                old_path: Some(source_location.to_string()),
                status: "renamed".into(),
                additions: 0,
                deletions: 0,
            }),
        })
        .collect();

    Ok((commit, files))
}
