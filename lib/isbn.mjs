export function normalizeIsbn(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[-\s]/g, "").toUpperCase();
}

export function isValidIsbn(value) {
  const isbn = normalizeIsbn(value);
  let total = 0;
  if (/^[0-9]{9}[0-9X]$/.test(isbn)) {
    for (let index = 0; index < 10; index++) {
      const digit = isbn[index] === "X" ? 10 : Number(isbn[index]);
      total += digit * (10 - index);
    }
    return total % 11 === 0;
  }
  if (/^(978|979)[0-9]{10}$/.test(isbn)) {
    for (let index = 0; index < 13; index++) {
      total += Number(isbn[index]) * (index % 2 === 0 ? 1 : 3);
    }
    return total % 10 === 0;
  }
  return false;
}
