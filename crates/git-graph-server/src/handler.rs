use std::path::Path;

use git_graph_core::error::CoreError;
use serde::Deserialize;
use serde_json::json;

use crate::protocol::{JsonRpcRequest, JsonRpcResponse};

const PROTOCOL_VERSION: u32 = 1;

pub fn handle_request(req: &JsonRpcRequest) -> JsonRpcResponse {
    match req.method.as_str() {
        "initialize" => handle_initialize(req),
        "getCommits" => handle_get_commits(req),
        "getBranches" => handle_get_branches(req),
        "getGraph" => handle_get_graph(req),
        "getCommitDetail" => handle_get_commit_detail(req),
        "getTags" => handle_get_tags(req),
        "search" => handle_search(req),
        "getDiff" => handle_get_diff(req),
        "getFileContent" => handle_get_file_content(req),
        _ => JsonRpcResponse::error(req.id, -32601, format!("method not found: {}", req.method)),
    }
}

fn handle_initialize(req: &JsonRpcRequest) -> JsonRpcResponse {
    let client_version = req
        .params
        .get("protocolVersion")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;

    if client_version != PROTOCOL_VERSION {
        return JsonRpcResponse::error(
            req.id,
            -32600,
            format!(
                "protocol version mismatch: server={PROTOCOL_VERSION}, client={client_version}"
            ),
        );
    }

    JsonRpcResponse::success(
        req.id,
        json!({
            "protocolVersion": PROTOCOL_VERSION,
            "serverVersion": env!("CARGO_PKG_VERSION"),
        }),
    )
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
    let skip = req.params.get("skip").and_then(|v| v.as_u64()).unwrap_or(0) as usize;

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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphCommitInput {
    id: String,
    parent_ids: Vec<String>,
}

fn handle_get_graph(req: &JsonRpcRequest) -> JsonRpcResponse {
    let commits: Vec<GraphCommitInput> =
        match serde_json::from_value(req.params.get("commits").cloned().unwrap_or_default()) {
            Ok(c) => c,
            Err(_) => {
                return JsonRpcResponse::error(req.id, -32602, "missing or invalid param: commits")
            }
        };

    let input: Vec<(String, Vec<String>)> =
        commits.into_iter().map(|c| (c.id, c.parent_ids)).collect();

    let (nodes, edges) = git_graph_core::graph::compute_layout(&input);
    JsonRpcResponse::success(req.id, json!({ "nodes": nodes, "edges": edges }))
}

fn handle_get_commit_detail(req: &JsonRpcRequest) -> JsonRpcResponse {
    let repo_path = match req.params.get("repoPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: repoPath"),
    };
    let commit_id = match req.params.get("commitId").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: commitId"),
    };

    match git_graph_core::diff::get_commit_detail(Path::new(repo_path), commit_id) {
        Ok((commit, files)) => {
            JsonRpcResponse::success(req.id, json!({ "commit": commit, "files": files }))
        }
        Err(e) => core_error_to_response(req.id, &e),
    }
}

fn handle_get_tags(req: &JsonRpcRequest) -> JsonRpcResponse {
    let repo_path = match req.params.get("repoPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: repoPath"),
    };

    match git_graph_core::tag::list_tags(Path::new(repo_path)) {
        Ok(tags) => JsonRpcResponse::success(req.id, json!({ "tags": tags })),
        Err(e) => core_error_to_response(req.id, &e),
    }
}

fn handle_search(req: &JsonRpcRequest) -> JsonRpcResponse {
    let repo_path = match req.params.get("repoPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: repoPath"),
    };
    let query = match req.params.get("query").and_then(|v| v.as_str()) {
        Some(q) => q,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: query"),
    };
    let search_type = req
        .params
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("all");
    let max_count = req
        .params
        .get("maxCount")
        .and_then(|v| v.as_u64())
        .unwrap_or(100) as usize;

    match git_graph_core::search::search_commits(
        Path::new(repo_path),
        query,
        search_type,
        max_count,
    ) {
        Ok(results) => JsonRpcResponse::success(req.id, json!({ "results": results })),
        Err(e) => core_error_to_response(req.id, &e),
    }
}

fn handle_get_diff(req: &JsonRpcRequest) -> JsonRpcResponse {
    let repo_path = match req.params.get("repoPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: repoPath"),
    };
    let commit_id = match req.params.get("commitId").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: commitId"),
    };
    let file_path = req.params.get("filePath").and_then(|v| v.as_str());

    match git_graph_core::diff::get_commit_detail(Path::new(repo_path), commit_id) {
        Ok((_, files)) => {
            let diffs = match file_path {
                Some(fp) => files.into_iter().filter(|f| f.path == fp).collect(),
                None => files,
            };
            JsonRpcResponse::success(req.id, json!({ "diffs": diffs }))
        }
        Err(e) => core_error_to_response(req.id, &e),
    }
}

fn handle_get_file_content(req: &JsonRpcRequest) -> JsonRpcResponse {
    let repo_path = match req.params.get("repoPath").and_then(|v| v.as_str()) {
        Some(p) => p,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: repoPath"),
    };
    let commit_id = match req.params.get("commitId").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: commitId"),
    };
    let file_path = match req.params.get("filePath").and_then(|v| v.as_str()) {
        Some(f) => f,
        None => return JsonRpcResponse::error(req.id, -32602, "missing param: filePath"),
    };

    match git_graph_core::content::get_file_content(Path::new(repo_path), commit_id, file_path) {
        Ok(content) => JsonRpcResponse::success(req.id, json!({ "content": content })),
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
