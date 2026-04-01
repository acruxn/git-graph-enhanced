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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpg_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gpg_signer: Option<String>,
}

pub fn list_commits(
    repo_path: &Path,
    skip: usize,
    max_count: usize,
    sort: &str,
) -> CoreResult<(Vec<Commit>, bool)> {
    let repo = open_repo(repo_path)?;
    let mailmap = repo.open_mailmap();
    let head_id = repo
        .head_id()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let sorting = match sort {
        "topo" => Sorting::BreadthFirst,
        _ => Sorting::ByCommitTime(Default::default()),
    };

    let walk = repo
        .rev_walk([head_id])
        .sorting(sorting)
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
            author: {
                let resolved = mailmap.resolve_cow(author_sig);
                Author {
                    name: resolved.name.to_string(),
                    email: resolved.email.to_string(),
                }
            },
            committer: {
                let resolved = mailmap.resolve_cow(committer_sig);
                Author {
                    name: resolved.name.to_string(),
                    email: resolved.email.to_string(),
                }
            },
            parent_ids: decoded.parents().map(|p| p.to_string()).collect(),
            timestamp,
            gpg_status: None,
            gpg_signer: None,
        });
    }

    let has_more = commits.len() > max_count;
    commits.truncate(max_count);
    Ok((commits, has_more))
}

pub fn list_reflog(repo_path: &Path, max_count: usize) -> CoreResult<Vec<Commit>> {
    let repo = open_repo(repo_path)?;
    let mailmap = repo.open_mailmap();
    let head_ref = repo
        .find_reference("HEAD")
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
    let mut log_platform = head_ref.log_iter();
    let log = log_platform
        .all()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let Some(log) = log else {
        return Ok(Vec::new());
    };

    let mut commits = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for entry in log.take(max_count) {
        let entry = entry.map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
        let oid = match gix::ObjectId::from_hex(entry.new_oid.as_ref()) {
            Ok(id) => id,
            Err(_) => continue,
        };
        if !seen.insert(oid) {
            continue;
        }
        let object = match repo.find_object(oid) {
            Ok(o) => o,
            Err(_) => continue,
        };
        let commit_obj = object.into_commit();
        let decoded = match commit_obj.decode() {
            Ok(d) => d,
            Err(_) => continue,
        };

        let author_sig = match decoded.author() {
            Ok(s) => s,
            Err(_) => continue,
        };
        let committer_sig = match decoded.committer() {
            Ok(s) => s,
            Err(_) => continue,
        };
        let timestamp = committer_sig.time().map(|t| t.seconds).unwrap_or(0);

        let hex = oid.to_string();
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
            author: {
                let resolved = mailmap.resolve_cow(author_sig);
                Author {
                    name: resolved.name.to_string(),
                    email: resolved.email.to_string(),
                }
            },
            committer: {
                let resolved = mailmap.resolve_cow(committer_sig);
                Author {
                    name: resolved.name.to_string(),
                    email: resolved.email.to_string(),
                }
            },
            parent_ids: decoded.parents().map(|p| p.to_string()).collect(),
            timestamp,
            gpg_status: None,
            gpg_signer: None,
        });
    }

    Ok(commits)
}
