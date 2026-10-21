export default function DataTable({ label, columns, items, rowKey = (item) => item.id }) {
  return <table className="data-table">
    <caption className="visually-hidden">{label}</caption>
    <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
    <tbody>{items.map((item) => <tr key={rowKey(item)}>{columns.map((column, index) => index === 0
      ? <th key={column.key} scope="row">{column.render(item)}</th>
      : <td key={column.key} data-label={column.label}>{column.render(item)}</td>)}</tr>)}</tbody>
  </table>;
}
