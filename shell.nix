{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.cairo
    pkgs.pango
    pkgs.libjpeg
    pkgs.giflib
    pkgs.librsvg
    pkgs.pkg-config
    pkgs.libuuid
    pkgs.freetype
    pkgs.fontconfig
    pkgs.glib
    pkgs.harfbuzz
  ];

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath [
      pkgs.cairo
      pkgs.pango
      pkgs.libjpeg
      pkgs.giflib
      pkgs.librsvg
      pkgs.libuuid
      pkgs.freetype
      pkgs.fontconfig
      pkgs.glib
      pkgs.harfbuzz
    ]}:$LD_LIBRARY_PATH
  '';
}
