import type { NightDigest } from '../digest/types.js';

export function DigestPage({ night, digest }: { night: string; digest: NightDigest }) {
  const rows = [...digest.rows].sort((left, right) => left.job.localeCompare(right.job));

  return (
    <>
      <h1>digest · {night}</h1>
      {digest.badLines > 0 && (
        <p class="warn">
          {digest.badLines} malformed {digest.badLines === 1 ? 'line' : 'lines'}
        </p>
      )}
      {rows.length === 0 ? (
        <p class="mute">{digest.badLines === 0 ? 'nothing ran' : 'no readable runs'}</p>
      ) : (
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
            {rows.map((row) => {
              const hasWarning = row.retries >= 3 || row.lastStatus === 'fail';

              return (
                <tr class={hasWarning ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td>{row.retries}</td>
                  <td>{row.lastStatus}</td>
                  <td>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt}</td>
                  <td>{row.lastAt}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
