{
  system,
  nixpkgs,
  fenix,
  android-nixpkgs,
}:
let
  pkgs = import nixpkgs {
    inherit system;
    overlays = [fenix.overlays.default];
    config = {
      allowUnfree = true;
      android_sdk.accept_license = true;
    };
  };

  buildInputs = import ./build-inputs.nix {
    inherit pkgs fenix android-nixpkgs;
  };

  devShells = import ./dev-shells.nix {
    inherit pkgs buildInputs;
  };
in {
  formatter = pkgs.alejandra;
  inherit devShells;
}
