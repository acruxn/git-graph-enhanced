use std::path::Path;

use crate::error::{CoreError, CoreResult};

pub fn open_repo(path: &Path) -> CoreResult<gix::Repository> {
    gix::open(path).map_err(|_| CoreError::RepoNotFound {
        path: path.to_path_buf(),
    })
}
