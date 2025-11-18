import { sequences } from "@/data/masterRecords";

type SequenceDefinition = (typeof sequences)[number];
export type SequenceKey = SequenceDefinition["key"];

const sequenceMap = new Map<SequenceKey, SequenceDefinition>(
  sequences.map((sequence) => [sequence.key, { ...sequence }]),
);

export function formatSequenceNumber(key: SequenceKey, value: number) {
  const definition = sequenceMap.get(key);
  if (!definition) {
    throw new Error(`Sequence ${key} not found`);
  }

  return `${definition.prefix}${value.toString().padStart(definition.padding, "0")}`;
}

export function peekSequence(key: SequenceKey) {
  const definition = sequenceMap.get(key);
  if (!definition) {
    throw new Error(`Sequence ${key} not found`);
  }

  return {
    key,
    prefix: definition.prefix,
    nextNumber: definition.nextNumber,
    formatted: formatSequenceNumber(key, definition.nextNumber),
    scope: definition.scope,
    padding: definition.padding,
  };
}

export function issueSequence(key: SequenceKey) {
  const definition = sequenceMap.get(key);
  if (!definition) {
    throw new Error(`Sequence ${key} not found`);
  }

  const formatted = formatSequenceNumber(key, definition.nextNumber);
  definition.nextNumber += 1;

  return {
    key,
    value: formatted,
    issuedNumber: definition.nextNumber - 1,
  };
}

