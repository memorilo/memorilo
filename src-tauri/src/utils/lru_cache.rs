use std::collections::{HashMap, VecDeque};
use std::hash::Hash;

/// A simple least-recently-used (LRU) cache.
///
/// Maintains recency via an internal queue; `get()` updates recency.
#[derive(Debug, Clone)]
pub struct LruCache<K, V> {
	capacity: usize,
	map: HashMap<K, V>,
	order: VecDeque<K>,
}

impl<K, V> LruCache<K, V>
where
	K: Eq + Hash + Clone,
{
	/// Create a new cache with the given `capacity`.
	pub fn new(capacity: usize) -> Self {
		Self {
			capacity,
			map: HashMap::new(),
			order: VecDeque::new(),
		}
	}

	/// Returns the current capacity.
	pub fn capacity(&self) -> usize {
		self.capacity
	}

	/// Returns the number of entries in the cache.
	pub fn len(&self) -> usize {
		self.map.len()
	}

	/// Returns true if the cache is empty.
	pub fn is_empty(&self) -> bool {
		self.map.is_empty()
	}

	/// Returns true if `key` is present.
	pub fn contains_key(&self, key: &K) -> bool {
		self.map.contains_key(key)
	}

	/// Removes all entries from the cache.
	pub fn clear(&mut self) {
		self.map.clear();
		self.order.clear();
	}

	/// Get a value by key and mark it as most recently used.
	pub fn get(&mut self, key: &K) -> Option<&V> {
		if !self.map.contains_key(key) {
			return None;
		}
		self.touch(key);
		self.map.get(key)
	}

	/// Get a value by key without updating recency.
	pub fn peek(&self, key: &K) -> Option<&V> {
		self.map.get(key)
	}

	/// Insert or update a value.
	///
	/// Returns the old value if the key already existed.
	pub fn put(&mut self, key: K, value: V) -> Option<V> {
		if self.capacity == 0 {
			self.clear();
			return None;
		}

		if self.map.contains_key(&key) {
			let old = self.map.insert(key.clone(), value);
			self.touch(&key);
			return old;
		}

		self.map.insert(key.clone(), value);
		self.order.push_back(key);
		self.evict_if_needed();
		None
	}

	/// Remove a key and return its value if present.
	pub fn remove(&mut self, key: &K) -> Option<V> {
		let removed = self.map.remove(key);
		if removed.is_some() {
			self.remove_from_order(key);
		}
		removed
	}

	/// Update the capacity and evict if needed.
	pub fn set_capacity(&mut self, capacity: usize) {
		self.capacity = capacity;
		self.evict_if_needed();
	}

	/// Remove and return the least recently used entry.
	pub fn pop_lru(&mut self) -> Option<(K, V)> {
		let key = self.order.pop_front()?;
		let value = self.map.remove(&key)?;
		Some((key, value))
	}

	fn touch(&mut self, key: &K) {
		self.remove_from_order(key);
		self.order.push_back(key.clone());
	}

	fn remove_from_order(&mut self, key: &K) {
		if let Some(position) = self.order.iter().position(|k| k == key) {
			self.order.remove(position);
		}
	}

	fn evict_if_needed(&mut self) {
		while self.map.len() > self.capacity {
			if let Some(lru_key) = self.order.pop_front() {
				self.map.remove(&lru_key);
			} else {
				break;
			}
		}
	}
}
