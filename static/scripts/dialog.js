const Dialog = {};

$(document).ready(() => {
    Dialog.$simpleDialog = $('#simple-dialog');

    Dialog.$simpleDialog.dialog({
        modal: true,
        autoOpen: false
    });

    Dialog.openSimpleDialog = ($dialog, title, text, width) => {
        $dialog.dialog('option', 'title', title);
        $dialog.dialog('option', 'width', width || 320);
        $dialog.dialog('option', 'buttons', [{
            text: 'Ok',
            click: () => { $dialog.dialog('close'); }
        }]);
        if (text) {
            $dialog.find('.dialog-text').html(text);
        }
        $dialog.dialog('open');
    };

    // Reaction bubble HTML. Reactions are now FontAwesome icon tokens
    // ("fa-thumbs-up", …) but old unicode payloads still render as text.
    // Both the sender name and any non-icon payload are escaped (XSS-safe).
    Dialog.reactionHtml = (from, emoji) => {
        const esc = (s) => $('<div>').text(s == null ? '' : s).html();
        if (/^fa-[a-z0-9-]+$/.test(emoji)) return esc(from) + ' <i class="fas ' + emoji + '"></i>';
        return esc(from + ' ' + emoji);
    };

    // --- Markdown viewer ----------------------------------------------------
    // Renders a live markdown file (rules.md, changelog.md) in a modal so the
    // content always reflects the current file — no frozen HTML copy to keep in
    // sync. Falls back to opening the raw file if marked / the modal is absent.
    Dialog.$markdown = $('#markdown-dialog');
    if (Dialog.$markdown.length) {
        Dialog.$markdown.dialog({
            modal: true,
            autoOpen: false,
            width: Math.min(820, $(window).width() - 40),
            height: Math.min(680, $(window).height() - 60),
            buttons: [{ text: 'Fermer', click: () => Dialog.$markdown.dialog('close') }]
        });
    }

    Dialog.openMarkdown = (url, title) => {
        const $d = Dialog.$markdown;
        if (!$d || !$d.length || typeof window.marked === 'undefined') {
            window.open(url, '_blank'); // graceful fallback
            return;
        }
        $d.dialog('option', 'title', title || 'Document');
        $d.find('.markdown-body').html('<p class="md-loading">Chargement…</p>');
        $d.dialog('open');
        // Cache-buster so an updated markdown is picked up without a hard reload.
        fetch(url + '?_=' + Date.now())
            .then(r => r.text())
            .then(md => {
                const html = window.marked.parse ? window.marked.parse(md) : window.marked(md);
                const $body = $d.find('.markdown-body').html(html);
                // The rules embed full-size illustrations: only fetch the ones
                // actually scrolled into view.
                $body.find('img').attr({ loading: 'lazy', decoding: 'async' });
            })
            .catch(() => $d.find('.markdown-body').html('<p>Impossible de charger le document.</p>'));
    };

    Dialog.openTwoChoicesDialog = ($dialog, title, text, okLabel, okCallback, cancelLabel, cancelCallback) => {
        $dialog.dialog('option', 'title', title);
        $dialog.dialog('option', 'width', 320);
        $dialog.dialog('option', 'buttons', [
            { text: okLabel, click: () => { okCallback(); $dialog.dialog('close'); } },
            { text: cancelLabel, click: () => { if (cancelCallback) cancelCallback(); $dialog.dialog('close'); } }
        ]);
        $dialog.find('.dialog-text').html(text);
        $dialog.dialog('open');
        // jQuery UI sets button labels as text; allow HTML labels (e.g. a
        // FontAwesome icon) by re-rendering any label that contains markup.
        const $btns = $dialog.dialog('widget').find('.ui-dialog-buttonpane button');
        if (/</.test(okLabel)) $btns.eq(0).html(okLabel);
        if (cancelLabel && /</.test(cancelLabel)) $btns.eq(1).html(cancelLabel);
    };
});
