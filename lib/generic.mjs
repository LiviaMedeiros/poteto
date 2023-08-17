const errorAsUndefined = () => {};
const requestConstructor = Reflect.construct.bind(Reflect, Request);
const responseConstructor = Reflect.construct.bind(Reflect, Response);

export {
  errorAsUndefined,
  requestConstructor,
  responseConstructor,
};
