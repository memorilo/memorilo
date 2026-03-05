use super::DocResult;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use yrs::types::text::YChange;
use yrs::{
    Any, Doc, Out, ReadTxn, Text, Transact, Xml, XmlElementRef, XmlFragment, XmlFragmentRef,
    XmlOut, XmlTextRef,
};

const JSON_EMPTY_OBJ: &str = "{}";

#[derive(Clone)]
pub(super) struct DocNodePayload {
    pub(super) node_name: String,
    pub(super) attr: String,
    pub(super) node_id: Option<String>,
    pub(super) text: Option<String>,
    pub(super) children: Vec<DocNodePayload>,
}

/// Convert a Yrs document's "doc" XML fragment into the root DocNodePayload.
pub(super) fn yjs_doc_to_doc_node(doc: &Doc) -> DocResult<DocNodePayload> {
    let txn = doc.transact();
    if let Some(fragment) = txn.get_xml_fragment("doc") {
        Ok(DocNodePayload {
            node_name: "doc".to_string(),
            attr: JSON_EMPTY_OBJ.to_string(),
            node_id: None,
            text: None,
            children: xml_fragment_children_to_nodes(&txn, &fragment),
        })
    } else {
        Ok(DocNodePayload {
            node_name: "doc".to_string(),
            attr: JSON_EMPTY_OBJ.to_string(),
            node_id: None,
            text: None,
            children: Vec::new(),
        })
    }
}

/// Convert all children of an XML fragment into DocNodePayload nodes.
fn xml_fragment_children_to_nodes<T: ReadTxn>(
    txn: &T,
    fragment: &XmlFragmentRef,
) -> Vec<DocNodePayload> {
    fragment
        .children(txn)
        .flat_map(|child| xml_out_to_nodes(txn, child))
        .collect()
}

/// Convert a Yrs XML output node into one or more DocNodePayload nodes.
fn xml_out_to_nodes<T: ReadTxn>(txn: &T, node: XmlOut) -> Vec<DocNodePayload> {
    match node {
        XmlOut::Text(text) => xml_text_to_nodes(txn, &text),
        XmlOut::Element(element) => vec![xml_element_to_node(txn, &element)],
        XmlOut::Fragment(fragment) => xml_fragment_children_to_nodes(txn, &fragment),
    }
}

/// Convert an XML element into a DocNodePayload, preserving attributes and children.
fn xml_element_to_node<T: ReadTxn>(txn: &T, element: &XmlElementRef) -> DocNodePayload {
    let node_id = element
        .get_attribute(txn, "id")
        .map(|out| out.to_string(txn))
        .filter(|value| !value.is_empty());

    let mut attr_map = serde_json::Map::new();
    for (key, value) in element.attributes(txn) {
        if key == "id" {
            continue;
        }
        attr_map.insert(key.to_string(), JsonValue::String(value.to_string(txn)));
    }

    let children = element
        .children(txn)
        .flat_map(|child| xml_out_to_nodes(txn, child))
        .collect();

    DocNodePayload {
        node_name: element.tag().to_string(),
        attr: JsonValue::Object(attr_map).to_string(),
        node_id,
        text: None,
        children,
    }
}

/// Convert an XML text node into DocNodePayload nodes, splitting by formatting marks.
fn xml_text_to_nodes<T: ReadTxn>(txn: &T, text: &XmlTextRef) -> Vec<DocNodePayload> {
    let mut nodes = Vec::new();
    for diff in text.diff(txn, YChange::identity) {
        let insert_text = match diff.insert {
            Out::Any(any) => any.to_string(),
            other => other.to_string(txn),
        };

        if insert_text.is_empty() {
            continue;
        }

        let text_node = DocNodePayload {
            node_name: "text".to_string(),
            attr: JSON_EMPTY_OBJ.to_string(),
            node_id: None,
            text: Some(insert_text),
            children: Vec::new(),
        };

        let Some(attrs) = diff.attributes.as_deref() else {
            nodes.push(text_node);
            continue;
        };

        let mut marks: Vec<(String, String)> = attrs
            .iter()
            .filter_map(|(key, value): (&std::sync::Arc<str>, &Any)| {
                mark_attr_json(value).map(|attr| (key.to_string(), attr))
            })
            .collect();

        if marks.is_empty() {
            nodes.push(text_node);
            continue;
        }

        marks.sort_by(|a, b| a.0.cmp(&b.0));

        let mut current = text_node;
        for (mark_name, mark_attr) in marks.into_iter().rev() {
            current = DocNodePayload {
                node_name: mark_name,
                attr: mark_attr,
                node_id: None,
                text: None,
                children: vec![current],
            };
        }

        nodes.push(current);
    }

    nodes
}

/// Convert a single mark attribute into its JSON string representation.
fn mark_attr_json(value: &Any) -> Option<String> {
    match value {
        Any::Null | Any::Undefined => None,
        Any::Bool(false) => None,
        Any::Bool(true) => Some(JSON_EMPTY_OBJ.to_string()),
        Any::Map(map) => Some(any_map_to_json(map.as_ref()).to_string()),
        other => {
            let mut obj = serde_json::Map::new();
            obj.insert("value".to_string(), any_to_json_value(other));
            Some(JsonValue::Object(obj).to_string())
        }
    }
}

/// Convert a Yrs Any map into a JSON object with deterministic key ordering.
fn any_map_to_json(map: &HashMap<String, Any>) -> JsonValue {
    let mut keys: Vec<&String> = map.keys().collect();
    keys.sort();
    let mut obj = serde_json::Map::new();
    for key in keys {
        if let Some(value) = map.get(key) {
            obj.insert(key.clone(), any_to_json_value(value));
        }
    }
    JsonValue::Object(obj)
}

/// Convert a Yrs Any value into a serde_json::Value.
fn any_to_json_value(value: &Any) -> JsonValue {
    match value {
        Any::Null | Any::Undefined => JsonValue::Null,
        Any::Bool(value) => JsonValue::Bool(*value),
        Any::Number(value) => serde_json::Number::from_f64(*value)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        Any::BigInt(value) => JsonValue::Number((*value).into()),
        Any::String(value) => JsonValue::String(value.to_string()),
        Any::Buffer(value) => JsonValue::Array(
            value
                .iter()
                .map(|byte| JsonValue::Number((*byte).into()))
                .collect(),
        ),
        Any::Array(values) => {
            JsonValue::Array(values.iter().map(any_to_json_value).collect())
        }
        Any::Map(map) => any_map_to_json(map.as_ref()),
    }
}
