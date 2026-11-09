import type { DigestResult } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: DigestResult }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">{digest.badLines} invalid {digest.badLines === 1 ? 'line' : 'lines'} skipped</p>
      )}
      <table>
        <thead>
          <tr>
            <th>job</th>
            <th>owner</th>
            <th>runs</th>
            <th>retries</th>
            <th>last status</th>
            <th>last error</th>
            <th>first time</th>
            <th>last time</th>
          </tr>
        </thead>
        <tbody>
          {digest.rows.length === 0 ? (
            <tr><td colspan={8} class="mute">nothing ran</td></tr>
          ) : (
            digest.rows.map((row) => (
              <tr>
                <td class={row.hasFailed ? 'warn' : undefined}>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</td>
                <td class={row.hasFailed ? 'warn' : undefined}>{row.lastStatus}</td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
