use serde::{Serialize, ser::SerializeStruct};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum Error {
    #[error("Database error: {0}")]
    DatabaseError(#[from] rusqlite::Error),
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let mut s = serializer.serialize_struct("Error", 2)?;
        match self {
            Error::DatabaseError(error) => {
                s.serialize_field("code", &0)?;
                s.serialize_field("message", &error.to_string())?;
                // s.serialize_field("error", error)?;
            },
        }
        s.end()
    }
}

pub type Result<T> = std::result::Result<T, Error>;