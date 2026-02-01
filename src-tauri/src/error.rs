use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, specta::Type, Serialize)]
pub enum ErrorKind {
    DatabaseError,
    IoError,
    SerializationError,
    CrdtError,
    StateError,
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

impl From<std::io::Error> for Error {
    fn from(err: std::io::Error) -> Self {
        Error {
            kind: ErrorKind::IoError,
            message: "IO error occurred".to_string(),
            inner_message: err.to_string()
        }
    }
}

impl From<serde_json::Error> for Error {
    fn from(err: serde_json::Error) -> Self {
        Error {
            kind: ErrorKind::SerializationError,
            message: "JSON serialization error occurred".to_string(),
            inner_message: err.to_string()
        }
    }
}

impl From<toml::ser::Error> for Error {
    fn from(err: toml::ser::Error) -> Self {
        Error {
            kind: ErrorKind::SerializationError,
            message: "TOML serialization error occurred".to_string(),
            inner_message: err.to_string()
        }
    }
}

impl From<toml::de::Error> for Error {
    fn from(err: toml::de::Error) -> Self {
        Error {
            kind: ErrorKind::SerializationError,
            message: "TOML deserialization error occurred".to_string(),
            inner_message: err.to_string()
        }
    }
}

impl From<std::sync::PoisonError<std::sync::MutexGuard<'_, rusqlite::Connection>>> for Error {
    fn from(err: std::sync::PoisonError<std::sync::MutexGuard<'_, rusqlite::Connection>>) -> Self {
        Error {
            kind: ErrorKind::StateError,
            message: "State lock poisoned".to_string(),
            inner_message: err.to_string(),
        }
    }
}

impl<T> From<std::sync::PoisonError<std::sync::MutexGuard<'_, std::collections::HashMap<String, T>>>> for Error {
    fn from(
        err: std::sync::PoisonError<std::sync::MutexGuard<'_, std::collections::HashMap<String, T>>>,
    ) -> Self {
        Error {
            kind: ErrorKind::StateError,
            message: "State lock poisoned".to_string(),
            inner_message: err.to_string(),
        }
    }
}

impl From<tauri::Error> for Error {
    fn from(err: tauri::Error) -> Self {
        Error {
            kind: ErrorKind::StateError,
            message: "IPC error occurred".to_string(),
            inner_message: err.to_string(),
        }
    }
}

impl From<yrs::encoding::read::Error> for Error {
    fn from(err: yrs::encoding::read::Error) -> Self {
        Error {
            kind: ErrorKind::CrdtError,
            message: "CRDT decode error occurred".to_string(),
            inner_message: err.to_string(),
        }
    }
}

impl From<yrs::error::UpdateError> for Error {
    fn from(err: yrs::error::UpdateError) -> Self {
        Error {
            kind: ErrorKind::CrdtError,
            message: "CRDT update error occurred".to_string(),
            inner_message: err.to_string(),
        }
    }
}

impl From<String> for Error {
    fn from(err: String) -> Self {
        Error {
            kind: ErrorKind::StateError,
            message: "Operation failed".to_string(),
            inner_message: err,
        }
    }
}

impl From<crate::db::doc::DocError> for Error {
    fn from(err: crate::db::doc::DocError) -> Self {
        match err {
            crate::db::doc::DocError::LockPoison { context } => Error {
                kind: ErrorKind::StateError,
                message: "State lock poisoned".to_string(),
                inner_message: context.to_string(),
            },
            crate::db::doc::DocError::Db { context, source } => Error {
                kind: ErrorKind::DatabaseError,
                message: format!("Database error during {context}"),
                inner_message: source.to_string(),
            },
            crate::db::doc::DocError::CrdtDecode { context, source } => Error {
                kind: ErrorKind::CrdtError,
                message: format!("CRDT decode error during {context}"),
                inner_message: source.to_string(),
            },
            crate::db::doc::DocError::CrdtUpdate { context, source } => Error {
                kind: ErrorKind::CrdtError,
                message: format!("CRDT update error during {context}"),
                inner_message: source.to_string(),
            },
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;
