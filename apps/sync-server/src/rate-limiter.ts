export interface RateLimitDecision {
  readonly allowed: boolean
  readonly firstRejected: boolean
  readonly limit: number
  readonly remaining: number
  readonly resetAt: number
}

interface RateLimitBucket {
  count: number
  resetAt: number
}

export interface RateLimiter {
  readonly check: (scope: string, key: string, limit: number, windowMs: number) => RateLimitDecision
}

export function createRateLimiter(now: () => number = Date.now): RateLimiter {
  const buckets = new Map<string, RateLimitBucket>()
  let checks = 0
  return {
    check: (scope, key, limit, windowMs) => {
      if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1)
        throw new RangeError('Rate limit and window must be positive integers')
      const timestamp = now()
      const bucketKey = `${scope}:${key}`
      let bucket = buckets.get(bucketKey)
      if (!bucket || bucket.resetAt <= timestamp) {
        bucket = { count: 0, resetAt: timestamp + windowMs }
        buckets.set(bucketKey, bucket)
      }
      bucket.count += 1
      checks += 1
      if (checks % 1024 === 0) {
        for (const [candidateKey, candidate] of buckets) {
          if (candidate.resetAt <= timestamp)
            buckets.delete(candidateKey)
        }
      }
      return {
        allowed: bucket.count <= limit,
        firstRejected: bucket.count === limit + 1,
        limit,
        remaining: Math.max(0, limit - bucket.count),
        resetAt: bucket.resetAt,
      }
    },
  }
}
