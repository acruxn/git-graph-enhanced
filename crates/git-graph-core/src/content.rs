use std::path::Path;

use crate::error::{CoreError, CoreResult};
use crate::repo::open_repo;

pub fn get_file_content(repo_path: &Path, commit_id: &str, file_path: &str) -> CoreResult<String> {
    let repo = open_repo(repo_path)?;
    let oid =
        gix::ObjectId::from_hex(commit_id.as_bytes()).map_err(|_| CoreError::InvalidRevision {
            rev: commit_id.to_owned(),
        })?;

    let object = repo
        .find_object(oid)
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;
    let tree = object
        .into_commit()
        .tree()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    let entry = tree
        .lookup_entry_by_path(file_path)
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?
        .ok_or_else(|| CoreError::InvalidRevision {
            rev: format!("file not found: {file_path}"),
        })?;

    let blob = entry
        .object()
        .map_err(|e| CoreError::InvalidRevision { rev: e.to_string() })?;

    Ok(String::from_utf8(blob.data.to_vec()).unwrap_or_else(|_| "(binary file)".into()))
}
