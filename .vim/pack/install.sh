#!/usr/bin/env bash
# Create new folder in ~/.vim/pack that contains a start folder and cd into it.
#
# Arguments:
#   package_group, a string folder name to create and change into.
#
# Examples:
#   set_group syntax-highlighting
#
function set_group () {
  package_group=$1
  path="$HOME/.vim/pack/$package_group/start"
  mkdir -p "$path"
  cd "$path" || exit
}
# Clone or update a git repo in the current directory.
#
# Arguments:
#   repo_url, a URL to the git repo.
#
# Examples:
#   package tpope/vim-endwise.git
#
function package () {
  repo_url="http://github.com/$1.git"
  expected_repo=$(basename "$repo_url" .git)
  if [[ -d "$expected_repo/.git" ]]; then
    cd "$expected_repo" || exit
    if [ "$expected_repo" = "coc.nvim" ]; then
      ./install.sh nightly
    fi
    result=$(git pull --force)
    echo "$expected_repo: $result"
  else
    echo "$expected_repo: Installing..."
    git clone -q "$repo_url"
  fi
}

function coc_extensions () {
  extensions_path="$HOME/.config/coc/extensions"
  mkdir -p "$extensions_path"
  cd "$extensions_path"
  if [ ! -f package.json ]; then
    echo '{"dependencies":{}}'> package.json
  fi
  yarn init
  yarn add coc-python
}

(
set_group ide
package Raimondi/delimitMate &
package junegunn/fzf.vim &
package Yggdroot/indentLine &
package scrooloose/nerdtree &
package jistr/vim-nerdtree-tabs &
package vim-airline/vim-airline &
package vim-airline/vim-airline-themes &
package vim-scripts/vim-auto-save &
package tpope/vim-eunuch &
package terryma/vim-multiple-cursors &
package bronson/vim-trailing-whitespace &
wait
) &
(set_group autocomplete
package honza/vim-snippets &
package tpope/vim-surround &
package davidhalter/jedi-vim &
# package ervandew/supertab &
# package valloric/youcompleteme &
package SirVer/ultisnips &
wait
) &
(
set_group session
package xolox/vim-misc &
package xolox/vim-session &
wait
) &
(
set_group git
package tpope/vim-fugitive &
package airblade/vim-gitgutter &
wait
) &
(
set_group latex
package lervag/vimtex &
wait
) &
# (
# set_group ruby
# package tpope/vim-rails &
# package tpope/vim-rake &
# package tpope/vim-bundler &
# package tpope/vim-endwise &
# wait
# ) &
(
set_group syntax
package w0rp/ale &
package mattn/emmet-vim &
package scrooloose/syntastic &
package kchmck/vim-coffee-script &
package tpope/vim-markdown &
package ap/vim-css-color &
wait
) &
(
set_group generated
package tpope/vim-commentary &
package vim-scripts/grep.vim &
package vim-scripts/CSApprox &
package majutsushi/tagbar &
package avelino/vim-bootstrap &
package avelino/vim-bootstrap-updater &
package sheerun/vim-polyglot &
wait
) &
(
set_group colorschemes
package altercation/vim-colors-solarized &
wait
) &
wait
(set_group coc
package neoclide/coc.nvim &
coc_extensions &
wait
) &
wait
