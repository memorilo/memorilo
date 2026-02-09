import { z } from 'zod'

export function unwrapSchema(schema: z.ZodType<any>): z.ZodType<any> {
  const def = (schema as any)._def
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapSchema((schema as any).unwrap())
  }
  if (def.typeName === 'ZodDefault' || def.type === 'default') {
    return unwrapSchema((schema as any).removeDefault ? (schema as any).removeDefault() : def.innerType)
  }
  if (def.typeName === 'ZodCatch' || def.type === 'catch') {
    return unwrapSchema((schema as any).removeCatch ? (schema as any).removeCatch() : def.innerType)
  }
  if (def.typeName === 'ZodEffects' || def.type === 'effects') {
    return unwrapSchema(def.schema)
  }
  if (def.typeName === 'ZodBranded' || def.type === 'branded') {
    return unwrapSchema((schema as any).unwrap())
  }
  if (def.typeName === 'ZodReadonly' || def.type === 'readonly') {
    return unwrapSchema((schema as any).unwrap())
  }
  if (def.type === 'optional' || def.type === 'nullable') {
    return unwrapSchema((schema as any).unwrap())
  }
  return schema
}

export function getZodType(schema: z.ZodType<any>): string {
  const def = (schema as any)._def
  if (def.typeName === 'ZodString' || def.type === 'string')
    return 'string'
  if (def.typeName === 'ZodNumber' || def.type === 'number')
    return 'number'
  if (def.typeName === 'ZodBoolean' || def.type === 'boolean')
    return 'boolean'
  if (def.typeName === 'ZodArray' || def.type === 'array')
    return 'array'
  if (def.typeName === 'ZodObject' || def.type === 'object')
    return 'object'
  if (def.typeName === 'ZodEnum' || def.type === 'enum')
    return 'enum'
  if (def.typeName === 'ZodNativeEnum' || def.type === 'nativeEnum')
    return 'enum'

  // Fallback property checks
  if ((schema as any).options && Array.isArray((schema as any).options))
    return 'enum'
  if ((schema as any).enum && typeof (schema as any).enum === 'object')
    return 'enum'

  // Check direct type property (Zod v4)
  if ((schema as any).type) {
    const type = (schema as any).type
    if (['string', 'number', 'boolean', 'array', 'object', 'enum'].includes(type)) {
      return type
    }
  }

  return 'unknown'
}

export function getEnumOptions(schema: z.ZodType<any>): string[] {
  const unwrapped = unwrapSchema(schema)
  const def = (unwrapped as any)._def
  let options: any[] = []

  if (def.typeName === 'ZodEnum' || def.type === 'enum' || Array.isArray((unwrapped as any).options)) {
    options = (unwrapped as any).options
  }
  else if (def.typeName === 'ZodNativeEnum' || def.type === 'nativeEnum' || (unwrapped as any).enum) {
    options = Object.values((unwrapped as any).enum).filter(val => typeof val === 'string')
  }
  return options.filter(v => typeof v === 'string' && !v.startsWith('_'))
}
