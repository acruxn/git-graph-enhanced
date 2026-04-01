use crate::commit::Commit;

pub fn filter_by_author(commits: &[Commit], author_query: &str) -> Vec<usize> {
    let query = author_query.to_lowercase();
    commits
        .iter()
        .enumerate()
        .filter(|(_, c)| {
            c.author.name.to_lowercase().contains(&query)
                || c.author.email.to_lowercase().contains(&query)
        })
        .map(|(i, _)| i)
        .collect()
}
