use serde::Serialize;


#[derive(Debug, Clone, Copy, PartialEq, Eq, specta::Type, Serialize)]
pub enum ErrorKind {
    DatabaseError
}

#[derive(Debug, specta::Type, Serialize, thiserror::Error)]
#[error("{message}: {inner_message}")]
pub struct Error {
    #[serde(rename = "_tag")]
    kind: ErrorKind,
    message: String,
    inner_message: String
}

impl From<rusqlite::Error> for Error {
    fn from(err: rusqlite::Error) -> Self {
        Error {
            kind: ErrorKind::DatabaseError,
            message: "Database error occurred".to_string(),
            inner_message: err.to_string()
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;