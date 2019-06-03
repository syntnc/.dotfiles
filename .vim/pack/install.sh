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
#   package https://github.com/tpope/vim-endwise.git
#
function package () {
  repo_url=$1
  expected_repo=$(basename "$repo_url" .git)
  if [ -d "$expected_repo" ]; then
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
package https://github.com/Raimondi/delimitMate.git &
package https://github.com/junegunn/fzf.vim.git &
package https://github.com/Yggdroot/indentLine.git &
package https://github.com/scrooloose/nerdtree.git &
package https://github.com/jistr/vim-nerdtree-tabs.git &
package https://github.com/vim-airline/vim-airline.git &
package https://github.com/vim-airline/vim-airline-themes.git &
package https://github.com/vim-scripts/vim-auto-save.git &
package https://github.com/tpope/vim-eunuch.git &
package https://github.com/terryma/vim-multiple-cursors.git &
package https://github.com/bronson/vim-trailing-whitespace.git &
wait
) &
(set_group autocomplete
package https://github.com/honza/vim-snippets.git &
package https://github.com/tpope/vim-surround.git &
package https://github.com/ervandew/supertab.git &
package https://github.com/valloric/youcompleteme.git &
package https://github.com/SirVer/ultisnips.git &
wait
) &
(
set_group session
package https://github.com/xolox/vim-misc.git &
package https://github.com/xolox/vim-session.git &
wait
) &
(
set_group git
package https://github.com/tpope/vim-fugitive.git &
package https://github.com/airblade/vim-gitgutter.git &
wait
) &
(
set_group latex
package https://github.com/lervag/vimtex.git &
wait
) &
(
set_group ruby
package https://github.com/tpope/vim-rails.git &
package https://github.com/tpope/vim-rake.git &
package https://github.com/tpope/vim-bundler.git &
package https://github.com/tpope/vim-endwise.git &
wait
) &
(
set_group syntax
package https://github.com/w0rp/ale.git &
package https://github.com/mattn/emmet-vim.git &
package https://github.com/scrooloose/syntastic.git &
package https://github.com/kchmck/vim-coffee-script.git &
package https://github.com/tpope/vim-markdown.git &
package https://github.com/ap/vim-css-color.git &
wait
) &
(
set_group generated
package https://github.com/tpope/vim-commentary.git &
package https://github.com/vim-scripts/grep.vim.git &
package https://github.com/vim-scripts/CSApprox.git &
package https://github.com/majutsushi/tagbar.git &
package https://github.com/avelino/vim-bootstrap.git &
package https://github.com/avelino/vim-bootstrap-updater.git &
package https://github.com/sheerun/vim-polyglot.git &
wait
) &
(
set_group colorschemes
package https://github.com/altercation/vim-colors-solarized.git &
wait
) &
wait
(set_group coc
package https://github.com/neoclide/coc.nvim.git &
coc_extensions &
wait
) &
wait
