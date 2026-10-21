export function formatDate(value) {
  if (!value) return "–";
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function loanStatus(loan, today) {
  if (loan.return_date) return "Zurückgegeben";
  if (loan.overdue) return "Überfällig";
  return loan.due_date === today ? "Heute fällig" : "Ausgeliehen";
}

export async function findLoan(status, id) {
  let page = 1;
  let result;
  do {
    result = await requestApi(`/api/admin/loans?status=${status}&page=${page}&pageSize=100`);
    const found = result.items.find((loan) => loan.id === id);
    if (found) return found;
    page++;
  } while ((page - 1) * result.pageSize < result.total && page <= 10000);
  return null;
}

export async function requestApi(url, options = {}) {
  let response;
  let data;
  try {
    response = await fetch(url, { cache: "no-store", ...options });
    data = await response.json();
  } catch {
    const error = new Error("Das Ergebnis konnte nicht bestätigt werden. Bitte prüfe den aktuellen Stand.");
    error.uncertain = true;
    throw error;
  }
  if (!response.ok) {
    let message = "Die Anfrage konnte nicht verarbeitet werden. Bitte versuche es erneut.";
    if (response.status === 401) message = "Bitte melde dich erneut an.";
    else if (response.status === 403) message = "Du bist nicht berechtigt, diese Aktion auszuführen.";
    else if (response.status < 500 && typeof data.error === "string") message = data.error;
    const error = new Error(message);
    error.status = response.status;
    error.uncertain = response.status >= 500;
    throw error;
  }
  return data;
}
