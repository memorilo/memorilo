{
  pkgs,
  buildInputs,
}:
rec {
  desktop = import ./dev-shells/desktop {inherit pkgs buildInputs;};
  android = import ./dev-shells/android {inherit pkgs buildInputs;};
  ios = import ./dev-shells/ios {inherit pkgs buildInputs;};
  default = desktop;
}
