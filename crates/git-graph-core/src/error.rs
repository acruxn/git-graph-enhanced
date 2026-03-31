use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum CoreError {
    #[error("repository not found: {path}")]
    RepoNotFound { path: PathBuf },
    #[error("invalid revision: {rev}")]
    InvalidRevision { rev: String },
    #[error(transparent)]
    Git(#[from] Box<gix::open::Error>),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

pub type CoreResult<T> = Result<T, CoreError>;
