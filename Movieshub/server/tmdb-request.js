// Node's fetch reuses its Undici connection pool, avoiding repeated DNS/TLS
// setup for each listing and detail request.
module.exports = async function tmdbRequest(url) {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) await response.arrayBuffer();
    return response;
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error('Movie provider timed out.');
    throw new Error('Cannot connect to movie provider.');
  }
};
