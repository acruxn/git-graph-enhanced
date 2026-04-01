use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::CoreResult;
use crate::repo::open_repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
    pub commit_id: String,
}

pub fn list_stashes(repo_path: &Path) -> CoreResult<Vec<StashEntry>> {
    let repo = open_repo(repo_path)?;
    let mut stashes = Vec::new();

    let reference = match repo.find_reference("refs/stash") {
        Ok(r) => r,
        Err(_) => return Ok(stashes),
    };

    let mut log_iter = reference.log_iter();
    let log = match log_iter.all() {
        Ok(l) => l,
        Err(_) => return Ok(stashes),
    };

    for (i, entry) in log.into_iter().flatten().enumerate() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        stashes.push(StashEntry {
            index: i,
            message: std::str::from_utf8(entry.message).unwrap_or("").to_owned(),
            commit_id: entry.new_oid.to_string(),
        });
    }

    Ok(stashes)
}
