use std::path::Path;

use gix::revision::walk::Sorting;
use serde::{Deserialize, Serialize};

use crate::commit::{Author, Commit};
use crate::error::{CoreError, CoreResult};
use crate::repo::open_repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub commit: Commit,
    pub match_field: String,
}

pub fn search_commits(
    repo_path: &Path,
    query: &str,
    search_type: &str,
    max_count: usize,
) -> CoreResult<Vec<SearchResult>> {
    let repo = open_repo(repo_path)?;
    let head_id = repo
        .head_id()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let walk = repo
        .rev_walk([head_id])
        .sorting(Sorting::ByCommitTime(Default::default()))
        .all()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    for info in walk {
        if results.len() >= max_count {
            break;
        }
        let info = info.map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
        let object = info
            .id()
            .object()
            .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
        let commit_obj = object.into_commit();
        let decoded = commit_obj
            .decode()
            .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

        let hex = info.id.to_string();

        let match_field = match search_type {
            "message" => match_message(&decoded, &query_lower),
            "author" => match_author(&decoded, &query_lower),
            "hash" => match_hash(&hex, &query_lower),
            _ => match_message(&decoded, &query_lower)
                .or_else(|| match_author(&decoded, &query_lower))
                .or_else(|| match_hash(&hex, &query_lower)),
        };

        if let Some(field) = match_field {
            let author_sig = decoded.author().ok();
            let committer_sig = decoded.committer().ok();
            let timestamp = committer_sig
                .as_ref()
                .and_then(|s| s.time().ok())
                .map(|t| t.seconds)
                .unwrap_or(0);

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
                author: author_sig
                    .as_ref()
                    .map(|s| Author {
                        name: s.name.to_string(),
                        email: s.email.to_string(),
                    })
                    .unwrap_or_else(|| Author {
                        name: String::new(),
                        email: String::new(),
                    }),
                committer: committer_sig
                    .as_ref()
                    .map(|s| Author {
                        name: s.name.to_string(),
                        email: s.email.to_string(),
                    })
                    .unwrap_or_else(|| Author {
                        name: String::new(),
                        email: String::new(),
                    }),
                parent_ids: decoded.parents().map(|p| p.to_string()).collect(),
                timestamp,
            };

            results.push(SearchResult {
                commit,
                match_field: field,
            });
        }
    }

    Ok(results)
}

fn match_message(decoded: &gix::objs::CommitRef<'_>, query: &str) -> Option<String> {
    let msg = std::str::from_utf8(decoded.message).unwrap_or("");
    if msg.to_lowercase().contains(query) {
        Some("message".into())
    } else {
        None
    }
}

fn match_author(decoded: &gix::objs::CommitRef<'_>, query: &str) -> Option<String> {
    let author = decoded.author().ok()?;
    let name = author.name.to_string().to_lowercase();
    let email = author.email.to_string().to_lowercase();
    if name.contains(query) || email.contains(query) {
        Some("author".into())
    } else {
        None
    }
}

fn match_hash(hex: &str, query: &str) -> Option<String> {
    if hex.starts_with(query) {
        Some("hash".into())
    } else {
        None
    }
}
