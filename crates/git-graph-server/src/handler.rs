use std::path::Path;

use git_graph_core::error::CoreError;
use serde_json::json;

use crate::protocol::{JsonRpcRequest, JsonRpcResponse};

pub fn handle_request(req: &JsonRpcRequest) -> JsonRpcResponse {
    match req.method.as_str() {
        "getCommits" => handle_get_commits(req),
        "getBranches" => handle_get_branches(req),
        _ => JsonRpcResponse::error(req.id, -32601, format!("method not found: {}", req.method)),
    }
}

fn handle_get_commits(req: &JsonRpcRequest) -> JsonRpcResponse {
    let repo_path = match req.params.get("repoPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: repoPath"),
    };
    let max_count = req
        .params
        .get("maxCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(500) as usize;
    let skip = req
        .params
        .get("skip")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;

    match git_graph_core::commit::list_commits(Path::new(repo_path), skip, max_count) {
        Ok((commits, has_more)) => {
            JsonRpcResponse::success(req.id, json!({ "commits": commits, "hasMore": has_more }))
        }
        Err(e) => core_error_to_response(req.id, &e),
    }
}

fn handle_get_branches(req: &JsonRpcRequest) -> JsonRpcResponse {
    let repo_path = match req.params.get("repoPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: repoPath"),
    };

    match git_graph_core::branch::list_branches(Path::new(repo_path)) {
        Ok(branches) => JsonRpcResponse::success(req.id, json!({ "branches": branches })),
        Err(e) => core_error_to_response(req.id, &e),
    }
}

fn core_error_to_response(id: u64, err: &CoreError) -> JsonRpcResponse {
    let (code, msg) = match err {
        CoreError::RepoNotFound { .. } => (-32001, err.to_string()),
        CoreError::InvalidRevision { .. } => (-32003, err.to_string()),
        _ => (-32002, err.to_string()),
    };
    JsonRpcResponse::error(id, code, msg)
}
