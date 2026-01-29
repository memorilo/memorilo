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

impl From<loro::LoroError> for Error {
    fn from(err: loro::LoroError) -> Self {
        Error {
            kind: ErrorKind::CrdtError,
            message: "CRDT error occurred".to_string(),
            inner_message: err.to_string(),
        }
    }
}

impl From<loro::LoroEncodeError> for Error {
    fn from(err: loro::LoroEncodeError) -> Self {
        Error {
            kind: ErrorKind::CrdtError,
            message: "CRDT encode error occurred".to_string(),
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

pub type Result<T> = std::result::Result<T, Error>;
