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

    Dialog.openTwoChoicesDialog = ($dialog, title, text, okLabel, okCallback, cancelLabel, cancelCallback) => {
        $dialog.dialog('option', 'title', title);
        $dialog.dialog('option', 'width', 320);
        $dialog.dialog('option', 'buttons', [
            { text: okLabel, click: () => { okCallback(); $dialog.dialog('close'); } },
            { text: cancelLabel, click: () => { if (cancelCallback) cancelCallback(); $dialog.dialog('close'); } }
        ]);
        $dialog.find('.dialog-text').html(text);
        $dialog.dialog('open');
    };
});
