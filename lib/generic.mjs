import { sep } from 'node:path';
import { cwd } from 'node:process';
import { pathToFileURL } from 'node:url';

const errorAsUndefined = () => {};
const requestConstructor = Reflect.construct.bind(Reflect, Request);
const responseConstructor = Reflect.construct.bind(Reflect, Response);
const getCwdURL = () => pathToFileURL(cwd() + sep).href;

export {
  errorAsUndefined,
  getCwdURL,
  requestConstructor,
  responseConstructor,
};
