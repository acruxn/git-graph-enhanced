use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::CoreResult;
use crate::repo::open_repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    pub commit_id: String,
    pub is_annotated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

pub fn list_tags(repo_path: &Path) -> CoreResult<Vec<Tag>> {
    let repo = open_repo(repo_path)?;
    let mut tags = Vec::new();

    let refs = repo.references().map_err(|e| {
        crate::error::CoreError::InvalidRevision { rev: e.to_string() }
    })?;

    let tag_refs = refs.tags().map_err(|e| {
        crate::error::CoreError::InvalidRevision { rev: e.to_string() }
    })?;

    for reference in tag_refs.flatten() {
        let name = reference
            .name()
            .as_bstr()
            .to_string()
            .strip_prefix("refs/tags/")
            .unwrap_or(&reference.name().as_bstr().to_string())
            .to_string();

        let target_id = reference.id().detach();

        // Check if the ref points to a tag object (annotated) or directly to a commit (lightweight)
        if let Ok(obj) = repo.find_object(target_id) {
            if obj.kind == gix::object::Kind::Tag {
                // Annotated tag — peel to commit and extract message
                let tag_ref = gix::objs::TagRef::from_bytes(&obj.data);
                let (commit_id, message) = match tag_ref {
                    Ok(t) => (
                        t.target().to_string(),
                        Some(std::str::from_utf8(t.message).unwrap_or("").trim().to_owned()),
                    ),
                    Err(_) => (target_id.to_string(), None),
                };
                let message = message.filter(|m| !m.is_empty());
                tags.push(Tag {
                    name,
                    commit_id,
                    is_annotated: true,
                    message,
                });
            } else {
                // Lightweight tag — points directly to a commit
                tags.push(Tag {
                    name,
                    commit_id: target_id.to_string(),
                    is_annotated: false,
                    message: None,
                });
            }
        }
    }

    Ok(tags)
}
