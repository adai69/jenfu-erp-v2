import {
  collection,
  doc,
  runTransaction,
  type Firestore,
} from "firebase/firestore";
import { db } from "@/lib/firebaseClient";
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

type SequenceDocument = {
  prefix: string;
  padding: number;
  nextNumber: number;
};

const sequenceCollection = collection(db, "sequences");

export async function issueSequence(key: SequenceKey) {
  const definition = sequenceMap.get(key);
  if (!definition) {
    throw new Error(`Sequence ${key} not found`);
  }

  const result = await runTransaction(db as Firestore, async (transaction) => {
    const ref = doc(sequenceCollection, key);
    const snapshot = await transaction.get(ref);

    let payload: SequenceDocument = {
      prefix: definition.prefix,
      padding: definition.padding,
      nextNumber: definition.nextNumber,
    };

    if (snapshot.exists()) {
      const data = snapshot.data() as SequenceDocument;
      payload = data;
    }

    const formatted = `${payload.prefix}${payload.nextNumber
      .toString()
      .padStart(payload.padding, "0")}`;

    transaction.set(
      ref,
      {
        prefix: payload.prefix,
        padding: payload.padding,
        nextNumber: payload.nextNumber + 1,
      },
      { merge: true },
    );

    return {
      value: formatted,
      issuedNumber: payload.nextNumber,
    };
  });

  definition.nextNumber = result.issuedNumber + 1;

  return {
    key,
    value: result.value,
    issuedNumber: result.issuedNumber,
  };
}

