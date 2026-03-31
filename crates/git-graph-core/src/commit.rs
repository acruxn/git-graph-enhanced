use std::path::Path;

use gix::revision::walk::Sorting;
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};
use crate::repo::open_repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub name: String,
    pub email: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub id: String,
    pub short_id: String,
    pub message: String,
    pub body: String,
    pub author: Author,
    pub committer: Author,
    pub parent_ids: Vec<String>,
    pub timestamp: i64,
}

pub fn list_commits(
    repo_path: &Path,
    skip: usize,
    max_count: usize,
) -> CoreResult<(Vec<Commit>, bool)> {
    let repo = open_repo(repo_path)?;
    let head_id = repo
        .head_id()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let walk = repo
        .rev_walk([head_id])
        .sorting(Sorting::ByCommitTime(Default::default()))
        .all()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let mut commits = Vec::with_capacity(max_count);
    for info in walk.skip(skip).take(max_count + 1) {
        let info = info.map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
        let object = info
            .id()
            .object()
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

        let hex = info.id.to_string();
        let short = hex[..7.min(hex.len())].to_string();

        let msg: &str = std::str::from_utf8(decoded.message).unwrap_or("");
        let (message, body) = match msg.split_once('\n') {
            Some((first, rest)) => (first.to_owned(), rest.trim().to_owned()),
            None => (msg.to_owned(), String::new()),
        };

        commits.push(Commit {
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
        });
    }

    let has_more = commits.len() > max_count;
    commits.truncate(max_count);
    Ok((commits, has_more))
}
