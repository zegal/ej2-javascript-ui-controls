import { Workbook, SheetModel, CellModel, getCell, setCell, getData } from '../base/index';
import { DataManager, Query, ReturnOption, DataUtil, Deferred } from '@syncfusion/ej2-data';
import { getCellIndexes, getIndexesFromAddress, getColumnHeaderText, getRangeAddress, workbookLocale, isNumber, getUpdatedFormula, getDataRange } from '../common/index';
import { SortDescriptor, SortOptions, BeforeSortEventArgs, SortEventArgs, getSwapRange, CellStyleModel } from '../common/index';
import { parseIntValue, SortCollectionModel } from '../common/index';
import { initiateSort } from '../common/event';
import { isNullOrUndefined, L10n } from '@syncfusion/ej2-base';

/**
 * The `WorkbookSort` module is used to handle sort action in Spreadsheet.
 */
export class WorkbookSort {
    private parent: Workbook;
    /**
     * Constructor for WorkbookSort module.
     *
     * @param {Workbook} parent - Specifies the workbook.
     */
    constructor(parent: Workbook) {
        this.parent = parent;
        this.addEventListener();
    }

    /**
     * To destroy the sort module.
     *
     * @returns {void} - To destroy the sort module.
     */
    protected destroy(): void {
        this.removeEventListener();
        this.parent = null;
    }

    private addEventListener(): void {
        this.parent.on(initiateSort, this.initiateSortHandler, this);
    }

    private removeEventListener(): void {
        if (!this.parent.isDestroyed) {
            this.parent.off(initiateSort, this.initiateSortHandler);
        }
    }

    /**
     * Sorts range of cells in the sheet.
     *
     * @param {{ args: BeforeSortEventArgs, promise: Promise<SortEventArgs> }} eventArgs - Specify the arguments.
     * @param {BeforeSortEventArgs} eventArgs.args - arguments for sorting.
     * @param {Promise<SortEventArgs>} eventArgs.promise - Specify the promise.
     * @param {SortCollectionModel} eventArgs.previousSort - Specify the previous sort model.
     * @returns {void} - Sorts range of cells in the sheet.
     */
    private initiateSortHandler(
        eventArgs: { args: BeforeSortEventArgs, promise: Promise<SortEventArgs>, previousSort: SortCollectionModel }): void {
        const args: BeforeSortEventArgs = eventArgs.args;
        const deferred: Deferred = new Deferred();
        const sheet: SheetModel = this.parent.getActiveSheet();
        let range: number[] = getSwapRange(getIndexesFromAddress(args.range));
        const sortOptions: SortOptions = args.sortOptions || { sortDescriptors: {}, containsHeader: true };
        let isSingleCell: boolean = false;

        eventArgs.promise = deferred.promise;
        if (range[0] > sheet.usedRange.rowIndex || range[1] > sheet.usedRange.colIndex) {
            deferred.reject(this.parent.serviceLocator.getService<L10n>(workbookLocale).getConstant('SortOutOfRangeError'));
            return;
        }

        let containsHeader: boolean = sortOptions.containsHeader;
        const checkForHeader: boolean = (args as { checkForHeader?: boolean }).checkForHeader;
        if (range[0] === range[2] || checkForHeader) { //if selected range is a single cell
            if (!checkForHeader) { range = getDataRange(range[0], range[1], sheet); }
            isSingleCell = true;
            if (isNullOrUndefined(sortOptions.containsHeader)) {
                if (typeof getCell(range[0], range[1], sheet, null, true).value ===
                    typeof getCell(range[0] + 1, range[1], sheet, null, true).value) {
                    containsHeader = this.isSameStyle(
                        getCell(range[0], range[1], sheet, null, true).style,
                        getCell(range[0] + 1, range[1], sheet, null, true).style) ? false : true;
                } else {
                    containsHeader = true;
                }
            }
        }
        if ((isNullOrUndefined(args.sortOptions) || isNullOrUndefined(args.sortOptions.containsHeader)) && !isSingleCell) {
            if (!isNullOrUndefined(getCell(range[0], range[1], sheet)) && !isNullOrUndefined(getCell(range[0] + 1, range[1], sheet))) {
                if (typeof getCell(range[0], range[1], sheet).value === typeof getCell(range[0] + 1, range[1], sheet).value) {
                    containsHeader = false;
                } else {
                    containsHeader = true;
                }
            }
        }
        let sRIdx: number = range[0] = containsHeader ? range[0] + 1 : range[0];
        let sCIdx: number;
        let eCIdx: number;
        const cell: number[] = getCellIndexes(sheet.activeCell);
        const header: string = getColumnHeaderText(cell[1] + 1);
        let sortDescriptors: SortDescriptor | SortDescriptor[] = sortOptions.sortDescriptors;
        const address: string = getRangeAddress(range);
        getData(this.parent, `${sheet.name}!${address}`, true, null, null, null, null, null, undefined, null, cell[1]).then((jsonData: { [key: string]: CellModel }[]) => {
            const dataManager: DataManager = new DataManager(jsonData);
            const query: Query = new Query();
            if (Array.isArray(sortDescriptors)) { //multi-column sorting.
                if (!sortDescriptors || sortDescriptors.length === 0) {
                    sortDescriptors = [{ field: header }];
                }
                for (let length: number = sortDescriptors.length, i: number = length - 1; i > -1; i--) {
                    if (!sortDescriptors[length - 1].field) {
                        sortDescriptors[length - 1].field = header;
                    }
                    if (!sortDescriptors[i].field) { continue; }
                    const comparerFn: Function = sortDescriptors[i].sortComparer
                        || this.sortComparer.bind(this, sortDescriptors[i], sortOptions.caseSensitive);
                    query.sortBy(sortDescriptors[i].field, comparerFn);
                }
            } else { //single column sorting.
                if (!sortDescriptors) {
                    sortDescriptors = { field: header };
                }
                if (!sortDescriptors.field) { sortDescriptors.field = header; }
                const comparerFn: Function = sortDescriptors.sortComparer
                    || this.sortComparer.bind(this, sortDescriptors, sortOptions.caseSensitive);
                query.sortBy(sortDescriptors.field, comparerFn);
            }
            dataManager.executeQuery(query).then((e: ReturnOption) => {
                let colName: string;
                let cell: CellModel = {};
                const rowKey: string = '__rowIndex';
                Array.prototype.forEach.call(e.result, (data: { [key: string]: CellModel }, index: number) => {
                    if (!data) { return; }
                    sCIdx = range[1];
                    eCIdx = range[3];
                    sRIdx = parseInt(jsonData[index][rowKey] as string, 10) - 1;
                    for (sCIdx; sCIdx <= eCIdx; sCIdx++) {
                        colName = getColumnHeaderText(sCIdx + 1);
                        cell = data[colName] as CellModel;
                        if (cell && cell.formula) {
                            cell.formula =
                            getUpdatedFormula([sRIdx, sCIdx], [parseInt(data[rowKey] as string, 10) - 1, sCIdx], sheet, cell);
                        }
                        setCell(sRIdx, sCIdx, sheet, cell);
                    }
                });
                const sortArgs: { range: string, sortOptions: SortOptions, previousSort?: SortCollectionModel } = { range:
                    `${sheet.name}!${address}`, sortOptions: args.sortOptions };
                if (eventArgs.previousSort) { sortArgs.previousSort = eventArgs.previousSort; }
                deferred.resolve(sortArgs);
            });
        });
    }

    private isSameStyle(firstCellStyle: CellStyleModel, secondCellStyle: CellStyleModel): boolean {
        if (!firstCellStyle) { firstCellStyle = {}; }
        if (!secondCellStyle) { secondCellStyle = {}; }
        let sameStyle: boolean = true;
        const keys: string[] = Object.keys(firstCellStyle);
        for (let i: number = 0; i < keys.length; i++) {
            if (firstCellStyle[keys[i]] === secondCellStyle[keys[i]] || this.parent.cellStyle[keys[i]] === firstCellStyle[keys[i]]) {
                sameStyle = true;
            } else {
                sameStyle = false;
                break;
            }
        }
        return sameStyle;
    }

    /**
     * Compares the two cells for sorting.
     *
     * @param {SortDescriptor} sortDescriptor - protocol for sorting.
     * @param {boolean} caseSensitive - value for case sensitive.
     * @param {CellModel} x - first cell
     * @param {CellModel} y - second cell
     * @returns {number} - Compares the two cells for sorting.
     */
    private sortComparer(sortDescriptor: SortDescriptor, caseSensitive: boolean, x: CellModel, y: CellModel): number {
        const direction: string = sortDescriptor.order || '';
        const comparer: Function = DataUtil.fnSort(direction);
        let isXStringVal: boolean = false; let isYStringVal: boolean = false;
        const caseOptions: { [key: string]: string } = { sensitivity: caseSensitive ? 'case' : 'base' };
        if (x && y && (typeof x.value === 'string' || typeof y.value === 'string') && (x.value !== '' && y.value !== '')) {
            if (isNumber(x.value)) { // Imported number values are of string type, need to handle this case in server side
                x.value = <string>parseIntValue(x.value);
                isXStringVal = true;
            }
            if (isNumber(y.value)) {
                y.value = <string>parseIntValue(y.value);
                isYStringVal = true;
            }
            if (!isYStringVal && !isYStringVal) {
                const collator: Intl.Collator = new Intl.Collator(this.parent.locale, caseOptions);
                if (!direction || direction.toLowerCase() === 'ascending') {
                    return collator.compare(x.value as string, y.value as string);
                } else {
                    return collator.compare(x.value as string, y.value as string) * -1;
                }
            }
        }
        if ((x === null || x && (isNullOrUndefined(x.value) || x.value === '')) && (y === null || y && (isNullOrUndefined(y.value) || y.value === ''))) {
            return -1;
        }
        if (x === null || x && (isNullOrUndefined(x.value) || x.value === '')) {
            return 1;
        }
        if (y === null || y && (isNullOrUndefined(y.value) || y.value === '')) {
            return -1;
        }
        return comparer(x ? x.value : x, y ? y.value : y);
    }

    /**
     * Gets the module name.
     *
     * @returns {string} - Get the module name.
     */
    protected getModuleName(): string {
        return 'workbookSort';
    }
}
