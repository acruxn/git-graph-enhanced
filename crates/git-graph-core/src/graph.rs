use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub commit_id: String,
    pub column: usize,
    pub color: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub from_commit_id: String,
    pub to_commit_id: String,
    pub from_column: usize,
    pub to_column: usize,
    pub color: usize,
}

const NUM_COLORS: usize = 8;

fn lowest_free(columns: &[Option<String>]) -> usize {
    columns
        .iter()
        .position(|s| s.is_none())
        .unwrap_or(columns.len())
}

/// Compute graph layout from commits in topological order (newest first).
/// Input: slice of (commit_id, parent_ids).
pub fn compute_layout(commits: &[(String, Vec<String>)]) -> (Vec<GraphNode>, Vec<GraphEdge>) {
    let mut active: Vec<Option<String>> = Vec::new();
    let mut col_color: HashMap<usize, usize> = HashMap::new();
    let mut next_color: usize = 0;

    let mut nodes = Vec::with_capacity(commits.len());
    let mut edges = Vec::new();

    for (commit_id, parent_ids) in commits {
        // 1. Find column for this commit
        let col = active
            .iter()
            .position(|s| s.as_deref() == Some(commit_id))
            .unwrap_or_else(|| {
                let c = lowest_free(&active);
                if c == active.len() {
                    active.push(None);
                }
                c
            });

        // 2. Assign color
        let color = if let Some(&c) = col_color.get(&col) {
            c
        } else {
            let c = next_color;
            next_color = (next_color + 1) % NUM_COLORS;
            col_color.insert(col, c);
            c
        };

        nodes.push(GraphNode {
            commit_id: commit_id.clone(),
            column: col,
            color,
        });

        // 3. Handle parents
        if parent_ids.is_empty() {
            // Root commit — free the column
            active[col] = None;
            col_color.remove(&col);
        } else {
            // First parent continues in this column
            active[col] = Some(parent_ids[0].clone());

            // Additional parents (merges)
            for parent_id in &parent_ids[1..] {
                let parent_col = active
                    .iter()
                    .position(|s| s.as_deref() == Some(parent_id))
                    .unwrap_or_else(|| {
                        let c = lowest_free(&active);
                        if c == active.len() {
                            active.push(None);
                        }
                        active[c] = Some(parent_id.clone());
                        let pc = next_color;
                        next_color = (next_color + 1) % NUM_COLORS;
                        col_color.insert(c, pc);
                        c
                    });

                edges.push(GraphEdge {
                    from_commit_id: commit_id.clone(),
                    to_commit_id: parent_id.clone(),
                    from_column: col,
                    to_column: parent_col,
                    color: *col_color.get(&parent_col).unwrap_or(&color),
                });
            }

            // Edge from commit to first parent
            edges.push(GraphEdge {
                from_commit_id: commit_id.clone(),
                to_commit_id: parent_ids[0].clone(),
                from_column: col,
                to_column: col,
                color,
            });
        }
    }

    (nodes, edges)
}
