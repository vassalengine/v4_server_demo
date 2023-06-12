import http from 'http';
import jwt from 'jsonwebtoken';

import {
  HTTPError,
  HTTPResponse,
  decodeRequestBody,
  err,
  handleRequest,
  ok
} from './common.mjs';

import {
  doAction,
  makeView,
  updateGlobal
} from './state.mjs';

import { dump_it } from './util.mjs';

const SECRET = '@wlD+3L)EHdv28u)OFWx@83_*TxhVf9IdUncaAz6ICbM~)j+dH=sR2^LXp(tW31z';

// curl -X GET localhost:8887/state -H 'Accept: application/json' -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoidWNrZWxtYW4iLCJpYXQiOjE2NzI5NjA0ODd9.3_X-TVxKHYZho-RZ94Lzz9EVKpjVUjHL0bapZ8vVCLc' -w "\n"

function getBearerToken(request) {
  let auth = request.headers['authorization'];
  if (!auth) {
    return err(new HTTPError(401, 'not authenticated'));
  }

  auth = auth.split(' ');
  if (auth[0] !== 'Bearer') {
    return err(new HTTPError(401, 'not authenticated'));
  }

  return ok(auth[1]);
}

function unpackJWT(token, secret) {
  return jwt.verify(
    token,
    secret,
    (error, decoded) => {
      if (error) {
        if (error.name === 'JsonWebTokenError') {
          return err(new HTTPError(400, error.message));
        }
        else {
          return err(new HTTPError(403, error.message));
        }
      }
      else {
        return ok(decoded);
      } 
    }
  );
}

function authorizeUser(request, secret) {
  let result = getBearerToken(request);
  if (result.error) {
    return result;
  }

  const bearer_token = result.value;
  return unpackJWT(bearer_token, secret);
}

function authorizePlayer(request, secret, u2p) {
  let result = authorizeUser(request, secret);
  if (result.error) {
    return result;
  }

  const jwt_token = result.value;
  console.log(jwt_token);
  
  const user = jwt_token.user;

  const pid = u2p[user];
  if (pid === undefined) {
    // TODO: make an observer role
    return err(new HTTPError(403, 'unrecognized player'));
  }

  return ok(pid); 
}

function handleGetState(ctx, request) {
  let result = authorizePlayer(request, ctx.secret, ctx.g.u2p);
  if (result.error) {
    return result;
  }

  const pid = result.value;

  const v = makeView(ctx.g, pid);

  return ok(new HTTPResponse(200, { 'g': v }));
}

async function handlePatchState(ctx, request) {
  let result = authorizePlayer(request, ctx.secret, ctx.g.u2p);
  if (result.error) {
    return result;
  }

  const pid = result.value;

  result = await decodeRequestBody(request);
  if (result.error) {
    return result;
  }

  const patches = result.value;

// TODO: awkward function signature
// TODO: send canned operations
  const g1 = updateGlobal(patches, ctx.g, pid);
  dump_it(g1);

  return ok(new HTTPResponse(200, {}));
}

async function handlePostState(ctx, request) {
  let result = authorizePlayer(request, ctx.secret, ctx.g.u2p);
  if (result.error) {
    return result;
  }

  const pid = result.value;

  result = await decodeRequestBody(request);
  if (result.error) {
    return result;
  }

  const action = result.value;

  const pv = doAction(action, ctx.g, pid);

  const fixed_pv = pv.map(p => ({ ...p, 'path': '/' + p.path.join('/') }));

  return ok(new HTTPResponse(200, {'p': fixed_pv }));
}

const routes = {
  '/state': {
    'GET': handleGetState,
    'POST': handlePostState,
    'PATCH': handlePatchState
  }
};

export const ctx = {
  'secret': SECRET,
  'g': {}
};

export function startServer(g) {
  ctx.g = g;

  const requestListener = (request, response) => {
    handleRequest(ctx, routes, request, response);
  };

  http.createServer(requestListener).listen(8887);
}
