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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_linear_history() {
        let commits = vec![
            ("a".into(), vec!["b".into()]),
            ("b".into(), vec!["c".into()]),
            ("c".into(), vec![]),
        ];
        let (nodes, edges) = compute_layout(&commits);
        assert_eq!(nodes.len(), 3);
        assert!(nodes.iter().all(|n| n.column == 0));
        assert_eq!(edges.len(), 2);
        assert!(edges.iter().all(|e| e.from_column == 0 && e.to_column == 0));
    }

    #[test]
    fn test_merge_creates_second_column() {
        let commits = vec![
            ("merge".into(), vec!["p1".into(), "p2".into()]),
            ("p1".into(), vec!["base".into()]),
            ("p2".into(), vec!["base".into()]),
            ("base".into(), vec![]),
        ];
        let (nodes, edges) = compute_layout(&commits);
        assert_eq!(nodes.len(), 4);
        let p2_node = nodes.iter().find(|n| n.commit_id == "p2").unwrap();
        assert_eq!(p2_node.column, 1);
        assert!(edges.iter().any(|e| e.from_column != e.to_column));
    }

    #[test]
    fn test_root_commit_frees_column() {
        let commits = vec![
            ("a".into(), vec!["b".into()]),
            ("c".into(), vec!["d".into()]),
            ("b".into(), vec![]),
            ("d".into(), vec![]),
        ];
        let (nodes, _) = compute_layout(&commits);
        assert_eq!(nodes.len(), 4);
    }

    #[test]
    fn test_empty_input() {
        let (nodes, edges) = compute_layout(&[]);
        assert!(nodes.is_empty());
        assert!(edges.is_empty());
    }

    #[test]
    fn test_single_commit() {
        let commits = vec![("only".into(), vec![])];
        let (nodes, edges) = compute_layout(&commits);
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].column, 0);
        assert!(edges.is_empty());
    }

    #[test]
    fn test_octopus_merge() {
        let commits = vec![
            ("merge".into(), vec!["p1".into(), "p2".into(), "p3".into()]),
            ("p1".into(), vec![]),
            ("p2".into(), vec![]),
            ("p3".into(), vec![]),
        ];
        let (nodes, edges) = compute_layout(&commits);
        assert_eq!(nodes.len(), 4);
        let cols: Vec<usize> = nodes.iter().map(|n| n.column).collect();
        assert!(cols.contains(&0));
        assert!(cols.contains(&1));
        assert!(cols.contains(&2));
        assert_eq!(edges.len(), 3);
    }

    #[test]
    fn test_color_cycling() {
        let commits: Vec<(String, Vec<String>)> =
            (0..10).map(|i| (format!("c{i}"), vec![])).collect();
        let (nodes, _) = compute_layout(&commits);
        let max_color = nodes.iter().map(|n| n.color).max().unwrap();
        assert!(max_color < 8);
    }
}
