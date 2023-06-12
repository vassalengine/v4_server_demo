export class HTTPResponse {
  constructor(code, body) {
    this.code = code;
    this.body = body;
  }
}

export class HTTPError extends HTTPResponse {
  constructor(code, error) {
    super(code, {'error': error});
  }
}

export function ok(v) {
  return { 'value': v };
}

export function err(e) {
  return { 'error': e };
}

export const MIME_JSON = 'application/json';

export function checkContentType(request) {
  // Ensure requests with payloads are using JSON
  if (request.method === 'POST' ||
      request.method === 'PUT' ||
      request.method === 'PATCH')
  {
    const contentType = request.headers['content-type'];
    if (!contentType?.includes(MIME_JSON)) {
      return err(new HTTPError(400, 'bad Content-Type'));
    }
  }
  
  return ok(true);
}

export function checkAccept(request) {
  // Ensure client accepts JSON
  const accept = request.headers['accept'];
  if (!accept?.includes(MIME_JSON) && !accept?.includes('*/*')) {
    return err(new HTTPError(400, 'bad Accept'));
  }
  return ok(true);
}

export async function decodeRequestBody(request) {
  return new Promise((resolve) => {
    request.setEncoding('utf8');

    // TODO: what kind of errors are these?
    request.on('error', (e) => resolve(err(new HTTPError(500, e))));

    let body = [];
    request.on('data', (chunk) => body.push(chunk));
    request.on('end', () => {
      body = body.join(''); 
      try {
        resolve(ok(JSON.parse(body)));
      }
      catch (e) {
        if (e instanceof SyntaxError) {
          // the payload is malformed
          resolve(err(new HTTPError(400, e.message)));
        }
        else {
          // probably shouldn't happen?
          resolve(err(new HTTPError(500, e.message)));
        }
      }
    });
  });
}

export function writeResponse(code, payload, response) {
  // TODO: what kind of errors are these?
  response.on('error', (err) => console.error(err));
  response.writeHead(code, {'Content-Type': MIME_JSON});
  response.end(JSON.stringify(payload));
}

export function writeResult(result, response) {
  const r = result.value || result.error;
  writeResponse(r.code, r.body, response);
}

export function getHandler(routes, request) {
  const route = routes[request.url];
  if (!route) {
    return err(new HTTPError(404, `${request.url} not found`));
  }

  const handler = route[request.method];
  if (!handler) {
    return err(new HTTPError(405, `${request.method} not allowed`));
  }

  return ok(handler);
}

export async function handleRequest(ctx, routes, request, response) {
  console.log(`${request.method} ${request.url}`);
  console.log(request.headers);

  let result = checkAccept(request);
  if (!result.error) {
    result = checkContentType(request);
    if (!result.error) {
      result = getHandler(routes, request);
      if (!result.error) {
        const handler = result.value;
        result = await handler(ctx, request);
      }
    }
  }

  writeResult(result, response);
}
