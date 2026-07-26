import { RectaMatrixError } from "./errors.js";
import { gfDivide, gfInverse, gfMultiply, gfPow } from "./gf256.js";
import { gfPolynomialMultiply } from "./gf256-polynomial.js";
import { GF256_PARAMETERS } from "./generated/spec-constants.js";

export interface ReedSolomonDecodeResult {
  readonly data: Uint8Array;
  readonly correctedCodeword: Uint8Array;
  readonly correctedCodewords: number;
  readonly erasuresUsed: number;
  readonly errorPositions: readonly number[];
}

export function buildGeneratorPolynomial(parityLength: number): Uint8Array {
  assertParityLength(parityLength);
  let generator: Uint8Array = Uint8Array.of(1);
  for (let root = 0; root < parityLength; root += 1) {
    generator = gfPolynomialMultiply(
      generator,
      Uint8Array.of(1, gfPow(GF256_PARAMETERS.primitiveElement, root)),
    );
  }
  return generator;
}

export function reedSolomonEncode(
  data: Uint8Array,
  parityLength: number,
): Uint8Array {
  assertBlockShape(data.length, parityLength);
  const generator = buildGeneratorPolynomial(parityLength);
  const work = new Uint8Array(data.length + parityLength);
  work.set(data);

  for (let dataIndex = 0; dataIndex < data.length; dataIndex += 1) {
    const coefficient = work[dataIndex]!;
    if (coefficient === 0) continue;
    for (
      let generatorIndex = 1;
      generatorIndex < generator.length;
      generatorIndex += 1
    ) {
      const workIndex = dataIndex + generatorIndex;
      work[workIndex] =
        work[workIndex]! ^ gfMultiply(generator[generatorIndex]!, coefficient);
    }
  }

  const codeword = new Uint8Array(data.length + parityLength);
  codeword.set(data);
  codeword.set(work.subarray(data.length), data.length);
  return codeword;
}

export function calculateSyndromes(
  codeword: Uint8Array,
  parityLength: number,
): Uint8Array {
  assertBlockShape(codeword.length - parityLength, parityLength);
  const syndromes = new Uint8Array(parityLength);
  for (let root = 0; root < parityLength; root += 1) {
    const evaluationPoint = gfPow(GF256_PARAMETERS.primitiveElement, root);
    let syndrome = 0;
    for (const coefficient of codeword) {
      syndrome = gfMultiply(syndrome, evaluationPoint) ^ coefficient;
    }
    syndromes[root] = syndrome;
  }
  return syndromes;
}

export function reedSolomonDecode(
  received: Uint8Array,
  parityLength: number,
  erasurePositions: readonly number[] = [],
): ReedSolomonDecodeResult {
  assertBlockShape(received.length - parityLength, parityLength);
  const erasures = validateErasures(
    erasurePositions,
    received.length,
    parityLength,
  );
  const syndromes = calculateSyndromes(received, parityLength);

  if (allZero(syndromes)) {
    return freezeDecodeResult(received, parityLength, 0, erasures.length, []);
  }

  const forneySyndromes = calculateForneySyndromes(
    syndromes,
    erasures,
    received.length,
  );
  const unknownErrorLocator = berlekampMassey(forneySyndromes);
  const erasureLocator = buildErrataLocator(erasures, received.length);
  const combinedLocator = multiplyAscending(
    unknownErrorLocator,
    erasureLocator,
  );
  const locatedPositions = findErrorPositions(combinedLocator, received.length);
  const erasureSet = new Set(erasures);
  const unknownErrorCount = locatedPositions.reduce(
    (count, position) => count + (erasureSet.has(position) ? 0 : 1),
    0,
  );

  if (
    2 * unknownErrorCount + erasures.length > parityLength ||
    locatedPositions.length !== combinedLocator.length - 1
  ) {
    throw rsFailure("Reed-Solomon correction capability was exceeded.");
  }
  for (const erasure of erasures) {
    if (!locatedPositions.includes(erasure)) {
      throw rsFailure("An erasure could not be located.");
    }
  }

  const magnitudes = solveErrorMagnitudes(
    syndromes,
    locatedPositions,
    received.length,
  );
  const corrected = received.slice();
  let correctedCodewords = 0;
  for (let index = 0; index < locatedPositions.length; index += 1) {
    const magnitude = magnitudes[index]!;
    if (magnitude !== 0) {
      const position = locatedPositions[index]!;
      corrected[position] = corrected[position]! ^ magnitude;
      correctedCodewords += 1;
    }
  }

  if (!allZero(calculateSyndromes(corrected, parityLength))) {
    throw rsFailure(
      "Reed-Solomon post-correction syndrome verification failed.",
    );
  }

  return freezeDecodeResult(
    corrected,
    parityLength,
    correctedCodewords,
    erasures.length,
    locatedPositions,
  );
}

function calculateForneySyndromes(
  syndromes: Uint8Array,
  erasures: readonly number[],
  codewordLength: number,
): Uint8Array {
  const reduced = Array.from(syndromes);
  for (const position of erasures) {
    const location = gfPow(
      GF256_PARAMETERS.primitiveElement,
      codewordLength - 1 - position,
    );
    for (let index = 0; index < reduced.length - 1; index += 1) {
      reduced[index] =
        gfMultiply(reduced[index]!, location) ^ reduced[index + 1]!;
    }
    reduced.pop();
  }
  return Uint8Array.from(reduced);
}

function berlekampMassey(sequence: Uint8Array): Uint8Array {
  const current = new Uint8Array(sequence.length + 1);
  const previous = new Uint8Array(sequence.length + 1);
  current[0] = 1;
  previous[0] = 1;
  let currentDegree = 0;
  let shift = 1;
  let previousDiscrepancy = 1;

  for (let step = 0; step < sequence.length; step += 1) {
    let discrepancy = sequence[step]!;
    for (let coefficient = 1; coefficient <= currentDegree; coefficient += 1) {
      discrepancy ^= gfMultiply(
        current[coefficient]!,
        sequence[step - coefficient]!,
      );
    }

    if (discrepancy === 0) {
      shift += 1;
      continue;
    }

    const snapshot = current.slice();
    const scale = gfDivide(discrepancy, previousDiscrepancy);
    for (let index = 0; index + shift < current.length; index += 1) {
      const currentIndex = index + shift;
      current[currentIndex] =
        current[currentIndex]! ^ gfMultiply(scale, previous[index]!);
    }

    if (2 * currentDegree <= step) {
      currentDegree = step + 1 - currentDegree;
      previous.set(snapshot);
      previousDiscrepancy = discrepancy;
      shift = 1;
    } else {
      shift += 1;
    }
  }

  return current.slice(0, currentDegree + 1);
}

function buildErrataLocator(
  positions: readonly number[],
  codewordLength: number,
): Uint8Array {
  let locator: Uint8Array = Uint8Array.of(1);
  for (const position of positions) {
    const location = gfPow(
      GF256_PARAMETERS.primitiveElement,
      codewordLength - 1 - position,
    );
    locator = multiplyAscending(locator, Uint8Array.of(1, location));
  }
  return locator;
}

function multiplyAscending(left: Uint8Array, right: Uint8Array): Uint8Array {
  const product = new Uint8Array(left.length + right.length - 1);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const productIndex = leftIndex + rightIndex;
      product[productIndex] =
        product[productIndex]! ^
        gfMultiply(left[leftIndex]!, right[rightIndex]!);
    }
  }
  return trimTrailingZeros(product);
}

function findErrorPositions(
  locator: Uint8Array,
  codewordLength: number,
): readonly number[] {
  const positions: number[] = [];
  for (let position = 0; position < codewordLength; position += 1) {
    const location = gfPow(
      GF256_PARAMETERS.primitiveElement,
      codewordLength - 1 - position,
    );
    if (evaluateAscending(locator, gfInverse(location)) === 0) {
      positions.push(position);
    }
  }
  return Object.freeze(positions);
}

function solveErrorMagnitudes(
  syndromes: Uint8Array,
  positions: readonly number[],
  codewordLength: number,
): Uint8Array {
  const count = positions.length;
  if (count === 0 || count > syndromes.length) {
    throw rsFailure("Invalid number of Reed-Solomon error locations.");
  }
  const matrix = Array.from({ length: count }, (_, row) => {
    const equation = new Uint8Array(count + 1);
    for (let column = 0; column < count; column += 1) {
      const location = gfPow(
        GF256_PARAMETERS.primitiveElement,
        codewordLength - 1 - positions[column]!,
      );
      equation[column] = gfPow(location, row);
    }
    equation[count] = syndromes[row]!;
    return equation;
  });

  for (let pivot = 0; pivot < count; pivot += 1) {
    let pivotRow = pivot;
    while (pivotRow < count && matrix[pivotRow]![pivot] === 0) {
      pivotRow += 1;
    }
    if (pivotRow === count) {
      throw rsFailure("Error-magnitude equations are singular.");
    }
    if (pivotRow !== pivot) {
      const temporary = matrix[pivot]!;
      matrix[pivot] = matrix[pivotRow]!;
      matrix[pivotRow] = temporary;
    }

    const inverse = gfInverse(matrix[pivot]![pivot]!);
    for (let column = pivot; column <= count; column += 1) {
      matrix[pivot]![column] = gfMultiply(matrix[pivot]![column]!, inverse);
    }
    for (let row = 0; row < count; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row]![pivot]!;
      if (factor === 0) continue;
      for (let column = pivot; column <= count; column += 1) {
        matrix[row]![column] =
          matrix[row]![column]! ^ gfMultiply(factor, matrix[pivot]![column]!);
      }
    }
  }

  return Uint8Array.from(matrix, (row) => row[count]!);
}

function evaluateAscending(polynomial: Uint8Array, value: number): number {
  let result = 0;
  for (let index = polynomial.length - 1; index >= 0; index -= 1) {
    result = gfMultiply(result, value) ^ polynomial[index]!;
  }
  return result;
}

function trimTrailingZeros(polynomial: Uint8Array): Uint8Array {
  let length = polynomial.length;
  while (length > 1 && polynomial[length - 1] === 0) {
    length -= 1;
  }
  return polynomial.slice(0, length);
}

function validateErasures(
  positions: readonly number[],
  codewordLength: number,
  parityLength: number,
): readonly number[] {
  if (positions.length > parityLength) {
    throw rsFailure("Too many Reed-Solomon erasures were supplied.");
  }
  const unique = new Set<number>();
  for (const position of positions) {
    if (
      !Number.isInteger(position) ||
      position < 0 ||
      position >= codewordLength
    ) {
      throw new RangeError("Reed-Solomon erasure position is invalid.");
    }
    if (unique.has(position)) {
      throw new RangeError("Reed-Solomon erasure positions must be unique.");
    }
    unique.add(position);
  }
  return Object.freeze([...unique].sort((left, right) => left - right));
}

function assertParityLength(parityLength: number): void {
  if (
    !Number.isInteger(parityLength) ||
    parityLength < 1 ||
    parityLength >= GF256_PARAMETERS.maximumCodewordBytes
  ) {
    throw new RangeError(
      "Reed-Solomon parity length must be between 1 and 254.",
    );
  }
}

function assertBlockShape(dataLength: number, parityLength: number): void {
  assertParityLength(parityLength);
  if (!Number.isInteger(dataLength) || dataLength < 1) {
    throw new RangeError(
      "A Reed-Solomon block must contain at least one data byte.",
    );
  }
  if (dataLength + parityLength > GF256_PARAMETERS.maximumCodewordBytes) {
    throw new RangeError("A Reed-Solomon codeword cannot exceed 255 bytes.");
  }
}

function allZero(values: Uint8Array): boolean {
  return values.every((value) => value === 0);
}

function freezeDecodeResult(
  corrected: Uint8Array,
  parityLength: number,
  correctedCodewords: number,
  erasuresUsed: number,
  errorPositions: readonly number[],
): ReedSolomonDecodeResult {
  const stableCodeword = corrected.slice();
  return Object.freeze({
    data: stableCodeword.slice(0, stableCodeword.length - parityLength),
    correctedCodeword: stableCodeword,
    correctedCodewords,
    erasuresUsed,
    errorPositions: Object.freeze([...errorPositions]),
  });
}

function rsFailure(message: string): RectaMatrixError {
  return new RectaMatrixError("RS_DECODE_FAILURE", message);
}
