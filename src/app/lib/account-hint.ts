// Whether this page load's frame said "signed-in customer" (E-11; the site layout's `signedIn`,
// a display hint, never authorisation). The basket's client loader reads it: a signed-in customer
// asks the server so checkout comes prefilled (S-212 AC1); guests keep the instant client render.
let signedIn = false;

export const accountHint = {
  set(value: boolean): void {
    signedIn = value;
  },
  get(): boolean {
    return signedIn;
  },
};
