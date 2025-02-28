import { Spreadsheet } from '../base/index';
import { formulaBar, locale, enableFormulaInput, DialogBeforeOpenEventArgs, focus } from '../common/index';
import { mouseUpAfterSelection, click } from '../common/index';
import { getRangeIndexes, getRangeFromAddress, getCellAddress, getCellIndexes } from './../../workbook/common/address';
import { CellModel, getSheetName, getTypeFromFormat, getSheet, SheetModel, checkIsFormula, Workbook, getCell } from '../../workbook/index';
import { updateSelectedRange, getSheetNameFromAddress, getSheetIndex, DefineNameModel, isLocked, getColumn } from '../../workbook/index';
import { ComboBox, DropDownList, SelectEventArgs as DdlSelectArgs } from '@syncfusion/ej2-dropdowns';
import { BeforeOpenEventArgs } from '@syncfusion/ej2-popups';
import { rippleEffect, L10n, EventHandler, detach, Internationalization, isNullOrUndefined, closest, select } from '@syncfusion/ej2-base';
import { isUndefined } from '@syncfusion/ej2-base';
import { editOperation, formulaBarOperation, keyDown, keyUp, formulaOperation, editAlert, editValue } from '../common/event';
import { intToDate } from '../../workbook/common/math';
import { Dialog } from '../services/dialog';
import { SelectEventArgs, ListView } from '@syncfusion/ej2-lists';
import { workbookFormulaOperation, selectionComplete } from '../../workbook/common/event';
import { isFormulaBarEdit } from '../common/event';

/**
 * Represents Formula bar for Spreadsheet.
 */
export class FormulaBar {
    private parent: Spreadsheet;
    private comboBoxInstance: ComboBox;
    private insertFnRipple: Function;
    private categoryCollection: string[] = [];
    private formulaCollection: string[] = [];
    private categoryList: DropDownList;
    private formulaList: ListView;
    private dialog: Dialog;
    private isGoto: boolean = false;
    constructor(parent: Spreadsheet) {
        this.parent = parent;
        this.addEventListener();
    }

    public getModuleName(): string {
        return 'formulaBar';
    }

    private createFormulaBar(args: { uiUpdate?: boolean }): void {
        if (!this.parent.showFormulaBar && this.insertFnRipple) {
            this.destroy(); return;
        }
        const l10n: L10n = this.parent.serviceLocator.getService(locale); const id: string = this.parent.element.id;
        const fBarWrapper: HTMLElement = this.parent.createElement('div', { className: 'e-formula-bar-panel' });
        if (!this.parent.isMobileView()) {
            const nameBox: HTMLElement = this.parent.createElement(
                'input', { id: id + '_name_box', attrs: { type: 'text' } });
            fBarWrapper.appendChild(nameBox);
            this.comboBoxInstance = new ComboBox({
                value: 'A1',
                cssClass: 'e-name-box',
                width: '',
                noRecordsTemplate: '',
                fields: { text: 'name', value: 'refersTo' },
                beforeOpen: this.nameBoxBeforeOpen.bind(this),
                blur: this.nameBoxBlur.bind(this),
                select: this.nameBoxSelect.bind(this),
                change: () => {
                    /** */
                }
            });
            this.comboBoxInstance.createElement = this.parent.createElement;
            this.comboBoxInstance.appendTo(nameBox);
            this.comboBoxInstance.element.parentElement.title = l10n.getConstant('NameBox');
        }
        const insertFnBtn: HTMLElement = fBarWrapper.appendChild(this.parent.createElement('button', {
            className: 'e-btn e-css e-flat e-icon-btn e-insert-function', attrs: { 'title': l10n.getConstant('InsertFunction') }
        }));
        insertFnBtn.appendChild(this.parent.createElement('span', { className: 'e-btn-icon e-icons' }));
        this.insertFnRipple = rippleEffect(fBarWrapper, { selector: '.e-insert-function' });
        fBarWrapper.appendChild(this.parent.createElement('div', { className: 'e-separator' }));
        const textarea: HTMLTextAreaElement = fBarWrapper.appendChild(this.parent.createElement('textarea', {
            className: 'e-formula-bar e-css', id: id + '_formula_input',
            attrs: { 'title': l10n.getConstant('FormulaBar'), 'spellcheck': 'false' }
        })) as HTMLTextAreaElement;
        textarea.rows = 1;
        if (this.parent.isMobileView()) {
            textarea.placeholder = l10n.getConstant('MobileFormulaBarPlaceHolder');
            EventHandler.add(textarea, 'focus', this.textAreaFocusIn, this);
            EventHandler.add(textarea, 'blur', this.textAreaFocusOut, this);
        } else {
            fBarWrapper.appendChild(this.parent.createElement('span', {
                className: 'e-drop-icon e-icons', attrs: { 'title': l10n.getConstant('ExpandFormulaBar') }
            }));
        }
        if (args && args.uiUpdate) {
            this.parent.element.insertBefore(fBarWrapper, document.getElementById(id + '_sheet_panel'));
        } else {
            this.parent.element.appendChild(fBarWrapper);
        }
    }
    private textAreaFocusIn(): void {
        const formulaPanel: Element = this.parent.element.querySelector('.e-formula-bar-panel');
        const tickBtn: HTMLElement = this.parent.createElement('button', { className: 'e-btn e-css e-flat e-icon-btn e-formula-submit' });
        tickBtn.appendChild(this.parent.createElement('span', { className: 'e-btn-icon e-icons e-tick-icon' }));
        formulaPanel.classList.add('e-focused');
        formulaPanel.appendChild(tickBtn);
    }
    private textAreaFocusOut(): void {
        const formulaPanel: Element = this.parent.element.querySelector('.e-formula-bar-panel');
        formulaPanel.classList.remove('e-focused');
        detach(formulaPanel.querySelector('.e-formula-submit'));
    }
    private keyDownHandler(e: KeyboardEvent): void {
        const trgtElem: HTMLTextAreaElement = <HTMLTextAreaElement>e.target;
        if (this.parent.isEdit && !this.parent.getActiveSheet().isProtected) {
            if ((checkIsFormula(trgtElem.value) || (trgtElem.validity && trgtElem.value.toString().indexOf('=') === 0)) &&
                e.keyCode === 16) {
                return;
            }
            if (trgtElem.classList.contains('e-formula-bar')) {
                this.parent.notify(
                    editOperation, { action: 'refreshEditor', value: trgtElem.value, refreshEditorElem: true });
            }
        }
    }
    private keyUpHandler(e: KeyboardEvent): void {
        if (this.parent.isEdit) {
            const trgtElem: HTMLTextAreaElement = <HTMLTextAreaElement>e.target;
            if (trgtElem.classList.contains('e-formula-bar')) {
                const eventArg: { editedValue: string, action: string } = { action: 'getCurrentEditValue', editedValue: '' };
                this.parent.notify(
                    editOperation, eventArg);
                if (eventArg.editedValue !== trgtElem.value && e.keyCode !== 16) {
                    this.parent.notify(
                        editOperation, { action: 'refreshEditor', value: trgtElem.value, refreshEditorElem: true });
                }
            }
        }
    }

    private nameBoxBeforeOpen(args: { [key: string]: Object }): void {
        if (this.comboBoxInstance.element.classList.contains('e-name-editing')) {
            args.cancel = true;
        } else {
            (<HTMLInputElement>this.comboBoxInstance.element).select();
        }
    }

    private nameBoxBlur(): void {
        if (this.comboBoxInstance.element.classList.contains('e-name-editing')) {
            this.comboBoxInstance.element.classList.remove('e-name-editing');
            this.UpdateValueAfterMouseUp();
        }
    }

    private nameBoxSelect(args: DdlSelectArgs): void {
        if (args.isInteracted) {
            const refersTo: string = (<DefineNameModel>args.itemData).refersTo.substr(1);
            const sheetIdx: number = getSheetIndex(this.parent as Workbook, getSheetNameFromAddress(refersTo));
            if (sheetIdx === undefined) { return; }
            let range: string = getRangeFromAddress(refersTo);
            const sheet: SheetModel = getSheet(this.parent as Workbook, sheetIdx);
            if (range.indexOf(':') !== -1) {
                const colIndex: number = range.indexOf(':');
                let left: string = range.substr(0, colIndex);
                let right: string = range.substr(colIndex + 1, range.length);
                left = left.replace('$', '');
                right = right.replace('$', '');
                if (right.match(/\D/g) && !right.match(/[0-9]/g) && left.match(/\D/g) && !left.match(/[0-9]/g)) {
                    left = left + '1';
                    right = right + sheet.rowCount;
                    range = left + ':' + right;
                } else if (!right.match(/\D/g) && right.match(/[0-9]/g) && !left.match(/\D/g) && left.match(/[0-9]/g)) {
                    left = getCellAddress(parseInt(left, 10) - 1, 0);
                    right = getCellAddress(parseInt(right, 10) - 1, sheet.colCount - 1);
                    range = left + ':' + right;
                }
            }
            if ((sheetIdx) === this.parent.activeSheetIndex) {
                this.parent.selectRange(range);
                focus(this.parent.element);
            } else {
                updateSelectedRange(this.parent as Workbook, range, sheet);
                this.parent.activeSheetIndex = sheetIdx;
            }
        }
    }

    private formulaBarUpdateHandler(e: MouseEvent & TouchEvent): void {
        const sheet: SheetModel = this.parent.getActiveSheet();
        const range: string[] = sheet.selectedRange.split(':');
        let address: string;
        const editArgs: { action: string, element: HTMLElement } = { action: 'getElement', element: null };
        this.parent.notify(editOperation, editArgs);
        const formulaBar: HTMLTextAreaElement = this.parent.element.querySelector('.e-formula-bar') as HTMLTextAreaElement;
        const intl: Internationalization = new Internationalization();
        if (e.type === 'mousemove' || e.type === 'pointermove') {
            const indexes1: number[] = getRangeIndexes(range[0]); const indexes2: number[] = getRangeIndexes(range[1]);
            address = `${Math.abs(indexes1[0] - indexes2[0]) + 1}R x ${Math.abs(indexes1[1] - indexes2[1]) + 1}C`;
            if (this.parent.isEdit) {
                if (e.target as Element && !(e.target as Element).classList.contains('e-spreadsheet-edit')) {
                    this.parent.notify(editValue, null);
                } else if (editArgs.element) {
                    formulaBar.value = editArgs.element.textContent;
                }
            }
        } else {
            address = range[0];
            const data: Promise<Map<string, CellModel>> = this.parent.getData(`${getSheetName(this.parent as Workbook)}!${address}`);
            data.then((values: Map<string, CellModel>): void => {
                let value: string = '';
                let intDate: Date;
                (values as Map<string, CellModel>).forEach((cell: CellModel): void => {
                    const type: string = cell && cell.format ? getTypeFromFormat(cell.format) : 'General';
                    if (cell) {
                        if (!isNullOrUndefined(cell.value)) {
                            intDate = intToDate(Number(cell.value));
                            if (intDate.toString() !== 'Invalid Date' && (type === 'ShortDate' || type === 'LongDate')) {
                                value = intl.formatDate(intDate, {
                                    type: 'date',
                                    skeleton: 'yMd'
                                });
                                if (value && value.indexOf('/') > -1 || value.indexOf('-') > 0) {
                                    const dateSplit: string[] = value.split(/-|\//);
                                    const cellFormat: string = cell ? cell.format : '';
                                    if (((cellFormat === 'dd-MM-yyyy' || cellFormat === 'dd/MM/yyyy')) && Number(dateSplit[0]) <= 12 && Number(dateSplit[1]) <= 31) {
                                        value = dateSplit[1] + '/' + dateSplit[0] + '/' + dateSplit[2];
                                    }
                                }
                            } else if (intDate.toString() !== 'Invalid Date' && type === 'Time') {
                                if (Number(cell.value) >= 1) {
                                    value = intl.formatDate(intDate, { type: 'dateTime', skeleton: 'yMd' }) + ' ';
                                }
                                value += intl.formatDate(intDate, { type: 'dateTime', skeleton: 'hms' });
                            } else {
                                value = cell.value;
                            }
                        }
                        if (cell.formula) {
                            value = cell.formula;
                        }
                    }
                    const eventArgs: { action: string, editedValue: string } = { action: 'getCurrentEditValue', editedValue: '' };
                    this.parent.notify(editOperation, eventArgs);
                    const isFormulaEdit: boolean = (eventArgs.editedValue && eventArgs.editedValue.toString().indexOf('=') === 0) ||
                        checkIsFormula(eventArgs.editedValue);
                    const formulaInp: HTMLTextAreaElement =
                        (<HTMLTextAreaElement>document.getElementById(this.parent.element.id + '_formula_input'));
                    const addressRange: number[] = getRangeIndexes(address);
                    const cellEle: HTMLElement = this.parent.getCell(addressRange[0], addressRange[1]);
                    if (cell && !cell.formula && cellEle && (type !== 'Time' || !value)) {
                        if (cell.value === undefined || (this.isDateTimeType(cell.format) && cell.value && intToDate(Number(cell.value)).toString() !== 'Invalid Date') || isNullOrUndefined(cell.format)) {
                            const key: string = this.isDateTimeType(cell.format);
                            if (key) {
                                const intl: Internationalization = new Internationalization();
                                let format: string = key === 'date' ? 'M/d/yyyy' : 'h:mm:ss a';
                                if (cell.format === 'dd-MM-yyyy' || cell.format === 'dd/MM/yyyy') {
                                    format = cell.format;
                                }
                                formulaInp.value = intl.formatDate(intToDate(parseFloat(cell.value)), { type: key, format: format});
                            } else {
                                if (cell.validation && cell.validation.type === 'List') {
                                    formulaInp.value = (cellEle.lastElementChild || cellEle).textContent;
                                } else {
                                    formulaInp.value = cellEle.textContent;
                                }
                            }
                        } else {
                            formulaInp.value = cell.value;
                        }
                    } else {
                        formulaInp.value = value;
                    }
                    if (!isNullOrUndefined(value) && !isFormulaEdit) {
                        this.parent.notify(
                            editOperation, { action: 'refreshEditor', value: formulaInp.value, refreshEditorElem: true });
                    }
                    if (this.parent.isEdit) {
                        if (e.target && !(e.target as Element).classList.contains('e-spreadsheet-edit')) {
                            this.parent.notify(editValue, null);
                        } else if (editArgs.element) {
                            formulaBar.value = editArgs.element.textContent;
                        }
                    }
                });
            });
        }
        this.updateComboBoxValue(address);
    }
    private isDateTimeType(format: string): string {
        const dateCodes: string[] = ['/', '-d', '-m', '-y', 'dd', 'mm', 'yy'];
        const timeCodes: string[] = [':', 'hh', 'h', 'mm:ss', 'h:mm:ss'];
        let result: string;
        timeCodes.forEach((code: string) => {
            if (format && format.indexOf(code) > -1) {
                result = 'time';
            }
        });
        if (result) {
            return result;
        } else {
            dateCodes.forEach((code: string) => {
                if (format && format.indexOf(code) > -1) {
                    result = 'date';
                }
            });
        }
        return result;
    }
    private UpdateValueAfterMouseUp(): void {
        this.updateComboBoxValue(this.parent.getActiveSheet().selectedRange.split(':')[0]);
    }
    private updateComboBoxValue(value: string): void {
        const sheet: SheetModel = this.parent.getActiveSheet();
        const range: string = getSheetName(this.parent as Workbook) + '!' + sheet.selectedRange;
        const eventArgs: { action: string, range: string, definedName: DefineNameModel } = {
            action: 'getNameFromRange', range: range, definedName: null
        };
        this.parent.notify(formulaOperation, eventArgs);
        if (eventArgs.definedName) {
            value = eventArgs.definedName.name;
        }
        if (!this.parent.isMobileView()) {
            if (this.comboBoxInstance.text === value) { return; }
            this.comboBoxInstance.text = value;
            this.comboBoxInstance.dataBind();
        }
    }
    private disabletextarea(): void {
        const element: HTMLTextAreaElement = this.getFormulaBar();
        if (this.parent.getActiveSheet().isProtected) {
            element.disabled = true;
        } else { element.disabled = false; }
    }
    private formulaBarScrollEdit(): void {
        const index: number[] = getRangeIndexes(this.parent.getActiveSheet().selectedRange);
        const viewportIndexes: number[] = getCellIndexes(this.parent.getActiveSheet().topLeftCell);
        if (index[0] < viewportIndexes[0]) {
            this.parent.goTo(this.parent.getActiveSheet().selectedRange);
            this.isGoto = true;
        }
        this.parent.notify(editOperation, { action: 'startEdit', refreshCurPos: false });
    }
    private formulaBarClickHandler(e: MouseEvent & TouchEvent): void {
        const target: HTMLElement = e.target as HTMLElement;
        const sheet: SheetModel = this.parent.getActiveSheet();
        const isSheetProtected: boolean = sheet.isProtected;
        const range: number[] = getCellIndexes(sheet.activeCell);
        const cell: CellModel = getCell(range[0], range[1], sheet);
        const isCellLocked: boolean = isLocked(cell, getColumn(sheet, range[1]));
        if (target.classList.contains('e-drop-icon') && closest(target, '.e-formula-bar-panel')) {
            this.toggleFormulaBar(target);
        } else if (target.classList.contains('e-formula-bar')) {
            if (!this.parent.isEdit && (!isSheetProtected || (isSheetProtected && !isCellLocked))) {
                this.formulaBarScrollEdit();
            } else if (isSheetProtected && isCellLocked) {
                this.parent.notify(editAlert, null);
            }
        } else if (target.parentElement && target.parentElement.classList.contains('e-name-box')) {
            if (target.classList.contains('e-ddl-icon')) {
                const eventArgs: { action: string, names: string[] } = { action: 'getNames', names: [] };
                this.parent.notify(formulaOperation, eventArgs);
                this.comboBoxInstance.dataSource = eventArgs.names;
            } else {
                this.comboBoxInstance.element.classList.add('e-name-editing');
                (<HTMLInputElement>this.comboBoxInstance.element).select();
            }
        }
        if (!isNullOrUndefined(target.offsetParent) && ((target.offsetParent.classList.contains('e-insert-function')) ||
            (target.classList.contains('e-insert-function')) || (this.parent.element.id + '_insert_function' === target.offsetParent.id)
            || (this.parent.element.id + '_insert_function' === target.id) ||
            target.parentElement.classList.contains('e-insert-function')
            || (this.parent.element.id + '_insert_function' === target.parentElement.id))) {
            if (isSheetProtected) {
                this.parent.notify(editAlert, null);
                return;
            }
            let isOpen: boolean = !this.parent.isEdit;
            const args: { [key: string]: Object } = { action: 'getCurrentEditValue', editedValue: '' };
            if (!isOpen) {
                const eventArgs: { [key: string]: Object } = { action: 'isFormulaEditing', isFormulaEdit: false };
                this.parent.notify(formulaOperation, eventArgs); isOpen = <boolean>eventArgs.isFormulaEdit;
                this.parent.notify(editOperation, args);
            }
            if (isOpen || args.editedValue === '') {
                if (args.editedValue === '') { this.parent.notify(editOperation, { action: 'refreshEditor', value: '=' }); }
                const l10n: L10n = this.parent.serviceLocator.getService(locale);
                const formulaDescription: HTMLElement = this.parent.createElement(
                    'div', { className: 'e-formula-description', id: this.parent.element.id + '_description_content' });
                const categoryContent: HTMLElement = this.parent.createElement(
                    'div', {
                        className: 'e-category-content', id: this.parent.element.id + '_category_content',
                        innerHTML: l10n.getConstant('PickACategory')
                    });
                const dropDownElement: HTMLElement = this.parent.createElement(
                    'input', { className: 'e-formula-category', id: this.parent.element.id + '_formula_category' });
                const listViewElement: HTMLElement = this.parent.createElement(
                    'div', { className: 'e-formula-list', id: this.parent.element.id + '_formula_list' });
                const descriptionContent: HTMLElement = this.parent.createElement(
                    'div', { className: 'e-description-content', innerHTML: l10n.getConstant('Description') });
                const headerContent: HTMLElement = this.parent.createElement(
                    'div', { className: 'e-header-content', innerHTML: l10n.getConstant('InsertFunction') });
                const categoryArgs: { action: string, categoryCollection: string[] } = {
                    action: 'getFormulaCategory', categoryCollection: []
                };
                this.parent.notify(workbookFormulaOperation, categoryArgs);
                this.categoryCollection = categoryArgs.categoryCollection;
                this.categoryList = new DropDownList({
                    dataSource: this.categoryCollection, index: 0, width: '285px', popupHeight: '210px',
                    select: this.dropDownSelect.bind(this)
                });
                const listArgs: { action: string, formulaCollection: string[] } = {
                    action: 'getLibraryFormulas', formulaCollection: []
                };
                this.parent.notify(workbookFormulaOperation, listArgs);
                this.formulaCollection = listArgs.formulaCollection;
                this.formulaList = new ListView({
                    dataSource: this.formulaCollection.sort(),
                    actionComplete: this.updateFormulaList.bind(this),
                    select: this.listSelected.bind(this), width: '285px', height: '200px'
                });
                this.dialog = this.parent.serviceLocator.getService('dialog');
                this.dialog.show({
                    header: headerContent.outerHTML,
                    content: categoryContent.outerHTML + dropDownElement.outerHTML + listViewElement.outerHTML +
                    descriptionContent.outerHTML + formulaDescription.outerHTML,
                    width: '320px', height: '485px', cssClass: 'e-spreadsheet-function-dlg',
                    showCloseIcon: true, isModal: true,
                    beforeOpen: (args: BeforeOpenEventArgs): void => {
                        const dlgArgs: DialogBeforeOpenEventArgs = {
                            dialogName: 'InsertFunctionDialog', element: args.element, target: args.target, cancel: args.cancel };
                        this.parent.trigger('dialogBeforeOpen', dlgArgs);
                        if (dlgArgs.cancel) { args.cancel = true; }
                        focus(this.parent.element); },
                    open: this.dialogOpen.bind(this), beforeClose: this.dialogBeforeClose.bind(this), close: this.dialogClose.bind(this),
                    buttons: [
                        {
                            click: (this.selectFormula.bind(this, this.dialog, this)),
                            buttonModel: { content: l10n.getConstant('Ok'), isPrimary: true }
                        }]
                });
                this.categoryList.appendTo('#' + this.parent.element.id + '_formula_category');
                this.formulaList.appendTo('#' + this.parent.element.id + '_formula_list');
                EventHandler.add(this.formulaList.element, 'dblclick', this.formulaClickHandler, this);
            }
        }
    }
    private toggleFormulaBar(target: HTMLElement): void {
        const parent: Element = target.parentElement; const l10n: L10n = this.parent.serviceLocator.getService(locale);
        if (parent.classList.contains('e-expanded')) {
            parent.classList.remove('e-expanded');
            (document.getElementById(this.parent.element.id + '_formula_input') as HTMLTextAreaElement).rows = 1;
            target.title = l10n.getConstant('ExpandFormulaBar');
        } else {
            parent.classList.add('e-expanded');
            (document.getElementById(this.parent.element.id + '_formula_input') as HTMLTextAreaElement).rows = 3;
            target.title = l10n.getConstant('CollapseFormulaBar');
        }
        this.parent.setPanelSize();
    }
    private dialogOpen(): void {
        this.focusOkButton();
    }

    private dialogClose(): void {
        const args: { [key: string]: Object } = { action: 'getCurrentEditValue', editedValue: '' };
        this.parent.notify(editOperation, args);
        if (args.editedValue.toString().trim() === '=') {
            this.parent.notify(editOperation, { action: 'refreshEditor', value: '' });
        }
    }

    private dialogBeforeClose(): void {
        EventHandler.remove(this.formulaList.element, 'dblclick', this.formulaClickHandler);
        const dialogContentEle: HTMLElement = document.getElementsByClassName('e-spreadsheet-function-dlg')[0].
            querySelector('.e-dlg-content');
        dialogContentEle.parentNode.removeChild(dialogContentEle);
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        (this.dialog.dialogInstance as any).storeActiveElement = document.getElementById(this.parent.element.id + '_edit');
    }

    private selectFormula(dialog: Dialog, formulaBarObj: FormulaBar): void {
        const formulaText: string | string[] | number | number[] = formulaBarObj.formulaList.getSelectedItems().text;
        const sheet: SheetModel = getSheet(this.parent as Workbook, this.parent.activeSheetIndex);
        if (this.parent.isEdit) {
            this.parent.notify(editOperation, {
                action: 'refreshEditor', value: formulaText + '(', refreshFormulaBar: true,
                refreshEditorElem: true, isAppend: true
            });
        } else {
            this.parent.notify(editOperation, { action: 'startEdit', value: '=' + formulaText + '(', address: sheet.activeCell });
            this.parent.notify(formulaBarOperation, { action: 'refreshFormulabar', value: '=' + formulaText + '(' });
        }
        dialog.hide();
    }
    private listSelected(): void {
        this.updateFormulaDescription();
    }
    private updateFormulaList(): void {
        this.activeListFormula();
        this.updateFormulaDescription();
    }
    private dropDownSelect(args: SelectEventArgs): void {
        this.formulaCollection = [];
        const listArgs: { action: string, formulaCollection: string[] } = {
            action: 'getLibraryFormulas',
            formulaCollection: []
        };
        if (args.item.textContent === 'All') {
            this.parent.notify(workbookFormulaOperation, listArgs);
            this.formulaCollection = listArgs.formulaCollection;
        } else {
            const category: string = args.item.textContent;
            const selectArgs: { action: string, formulaCollection: string[], selectCategory: string } = {
                action: 'dropDownSelectFormulas',
                formulaCollection: [],
                selectCategory: category
            };
            this.parent.notify(workbookFormulaOperation, selectArgs);
            this.formulaCollection = selectArgs.formulaCollection;
        }
        this.formulaList.dataSource = this.formulaCollection.sort();
    }
    private focusOkButton(): void {
        const focusEle: Element = document.getElementsByClassName('e-spreadsheet-function-dlg')[0].querySelector('.e-dlg-content');
        ((focusEle.nextElementSibling.firstElementChild) as HTMLElement).focus();
    }
    private activeListFormula(): void {
        const acListEle: HTMLElement = document.getElementById(this.parent.element.id + '_formula_list');
        const firstElement: Element = acListEle.children[0].children[0].firstElementChild;
        this.formulaList.selectItem(firstElement);
    }
    private updateFormulaDescription(): void {
        let selectedFormula: string | string[] | number | number[] = this.formulaList.getSelectedItems().text;
        const descriptionArgs: { action: string, description: string, selectedList: string | string[] | number | number[] } = {
            action: 'getFormulaDescription',
            description: '',
            selectedList: selectedFormula
        };
        this.parent.notify(workbookFormulaOperation, descriptionArgs);
        this.focusOkButton();
        const descriptionArea: Element = document.getElementById(this.parent.element.id + '_description_content');
        selectedFormula = (selectedFormula === 'AND') ? 'CalculateAND' : (selectedFormula === 'OR') ? 'CalculateOR' : selectedFormula;
        descriptionArea.innerHTML = (this.parent.serviceLocator.getService(locale) as L10n).getConstant(selectedFormula as string);
    }
    private formulaClickHandler(args: MouseEvent & TouchEvent): void {
        const trgtElem: HTMLElement = <HTMLElement>args.target;
        const sheet: SheetModel = getSheet(this.parent as Workbook, this.parent.activeSheetIndex);
        if (trgtElem.offsetParent.classList.contains('e-text-content') || trgtElem.classList.contains('e-list-item')) {
            if (this.parent.isEdit) {
                this.parent.notify(editOperation, {
                    action: 'refreshEditor', value: trgtElem.innerText + '(', refreshFormulaBar: true,
                    refreshEditorElem: true, isAppend: true
                });
            } else {
                this.parent.notify(
                    editOperation, { action: 'startEdit', value: '=' + trgtElem.innerText + '(', address: sheet.activeCell });
                this.parent.notify(formulaBarOperation, { action: 'refreshFormulabar', value: '=' + trgtElem.innerText + '(' });
            }
            this.dialog.hide();
        }
    }

    private addEventListener(): void {
        this.parent.on(formulaBar, this.createFormulaBar, this);
        this.parent.on(click, this.formulaBarClickHandler, this);
        this.parent.on(keyDown, this.keyDownHandler, this);
        this.parent.on(keyUp, this.keyUpHandler, this);
        this.parent.on(selectionComplete, this.formulaBarUpdateHandler, this);
        this.parent.on(mouseUpAfterSelection, this.UpdateValueAfterMouseUp, this);
        this.parent.on(formulaBarOperation, this.editOperationHandler, this);
        this.parent.on(enableFormulaInput, this.disabletextarea, this);
        this.parent.on(isFormulaBarEdit, this.isFormulaBarEdit, this);
    }
    public destroy(): void {
        this.removeEventListener();
        this.comboBoxInstance.destroy();
        this.comboBoxInstance = null;
        this.insertFnRipple();
        this.insertFnRipple = null;
        const formulaPanel: Element = this.parent.element.querySelector('.e-formula-bar-panel');
        if (formulaPanel) { detach(formulaPanel); }
    }

    private removeEventListener(): void {
        if (!this.parent.isDestroyed) {
            this.parent.off(formulaBar, this.createFormulaBar);
            this.parent.off(click, this.formulaBarClickHandler);
            this.parent.off(keyDown, this.keyDownHandler);
            this.parent.off(keyUp, this.keyUpHandler);
            this.parent.off(selectionComplete, this.formulaBarUpdateHandler);
            this.parent.off(mouseUpAfterSelection, this.UpdateValueAfterMouseUp);
            this.parent.off(formulaBarOperation, this.editOperationHandler);
            this.parent.off(enableFormulaInput, this.disabletextarea);
            this.parent.off(isFormulaBarEdit, this.isFormulaBarEdit);
        }
    }

    private editOperationHandler(args: { [key: string]: Object }): void {
        const action: string = <string>args.action;
        switch (action) {
        case 'refreshFormulabar':
            this.getFormulaBar().value = isUndefined(args.value) ? '' : <string>args.value;
            break;
        case 'getElement':
            args.element = this.getFormulaBar();
            break;
        }
    }
    private isFormulaBarEdit(args: { [key: string]: Object }): void {
        const edit: boolean = this.parent.isEdit;
        if (edit && this.isGoto) {
            args.isEdit = true;
        } else {
            args.isEdit = false;
        }
    }

    private getFormulaBar(): HTMLTextAreaElement {
        return select('#' + this.parent.element.id + '_formula_input', this.parent.element);
    }
}
