import { z } from 'zod'

export function unwrapSchema(schema: z.ZodType<any>): z.ZodType<any> {
  const def = (schema as any)._def
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return unwrapSchema((schema as any).unwrap())
  }
  if (def.typeName === 'ZodDefault') {
    return unwrapSchema((schema as any).removeDefault ? (schema as any).removeDefault() : def.innerType)
  }
  if (def.typeName === 'ZodCatch') {
    return unwrapSchema((schema as any).removeCatch ? (schema as any).removeCatch() : def.innerType)
  }
  if (def.typeName === 'ZodEffects') {
    return unwrapSchema(def.schema)
  }
  if (def.typeName === 'ZodBranded') {
    return unwrapSchema((schema as any).unwrap())
  }
  if (def.typeName === 'ZodReadonly') {
    return unwrapSchema((schema as any).unwrap())
  }
  return schema
}

export function getZodType(schema: z.ZodType<any>): string {
  const def = (schema as any)._def
  if (def.typeName === 'ZodString')
    return 'string'
  if (def.typeName === 'ZodNumber')
    return 'number'
  if (def.typeName === 'ZodBoolean')
    return 'boolean'
  if (def.typeName === 'ZodArray')
    return 'array'
  if (def.typeName === 'ZodObject')
    return 'object'
  if (def.typeName === 'ZodEnum')
    return 'enum'
  if (def.typeName === 'ZodNativeEnum')
    return 'enum'

  // Fallback property checks
  if ((schema as any).options && Array.isArray((schema as any).options))
    return 'enum'
  if ((schema as any).enum && typeof (schema as any).enum === 'object')
    return 'enum'

  return 'unknown'
}

export function getEnumOptions(schema: z.ZodType<any>): string[] {
  const unwrapped = unwrapSchema(schema)
  const def = (unwrapped as any)._def
  let options: any[] = []

  if (def.typeName === 'ZodEnum' || Array.isArray((unwrapped as any).options)) {
    options = (unwrapped as any).options
  }
  else if (def.typeName === 'ZodNativeEnum' || (unwrapped as any).enum) {
    options = Object.values((unwrapped as any).enum).filter(val => typeof val === 'string')
  }
  return options.filter(v => typeof v === 'string' && !v.startsWith('_'))
}
