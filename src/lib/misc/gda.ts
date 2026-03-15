import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import type Gda5 from 'gi://Gda?version=5.0';
import type Gda6 from 'gi://Gda?version=6.0';
import Gio from 'gi://Gio';

export interface SqlBuilder<T> extends Omit<Gda5.SqlBuilder, 'add_field_value_as_gvalue'> {
	add_id<K extends Extract<keyof T, string>>(str: K): Gda5.SqlBuilderId;

	select_add_field<K extends Extract<keyof T, string>>(
		field_name: K,
		table_name: string | null,
		alias: string | null,
	): Gda5.SqlBuilderId;

	add_field_value_as_gvalue<K extends Extract<keyof T, string>>(key: K, value: T[K] | string): void;
}

export interface DataModel<T> extends Omit<Gda5.DataModel, 'create_iter'> {
	create_iter(): DataModelIter<T>;
}

export interface DataModelIter<T> extends Omit<Gda5.DataModelIter, 'get_value_for_field'> {
	get_value_for_field<K extends Extract<keyof T, string>>(field_name: K): T[K];
}

export function new_connection(Gda: typeof Gda5, cncString: string): Gda5.Connection {
	if (Gda.__version__ === '6.0') {
		// Gda 6
		return new Gda.Connection({
			provider: Gda.Config.get_provider('SQLite'),
			cncString,
		});
	} else {
		// Gda 5
		const conn = Gda.Connection.new_from_string('SQLite', cncString, null, Gda.ConnectionOptions.THREAD_ISOLATED);
		if (conn.cnc_string === cncString) return conn;

		// Workaround for database not being stored only in home location
		// Two <user>:<password>@ pairs are required since the first is stripped at creation and the second is stripped
		// while opening the connection.
		cncString = `:@:@${cncString}`;
		return Gda.Connection.new_from_string('SQLite', cncString, null, Gda.ConnectionOptions.THREAD_ISOLATED);
	}
}

export function open_async(connection: Gda5.Connection | Gda6.Connection): Promise<boolean> {
	return new Promise((resolve, reject) => {
		if ('open_async' in connection) {
			// Gda 6
			GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
				try {
					connection.set_main_context(null, GLib.MainContext.ref_thread_default());
					connection.open_async((_cnc, _jobId, result) => resolve(result));
				} catch (error) {
					reject(error as Error);
				}

				return GLib.SOURCE_REMOVE;
			});
		} else {
			// Gda 5
			resolve(connection.open());
		}
	});
}

export function add_expr_value(builder: Gda5.SqlBuilder | Gda6.SqlBuilder | SqlBuilder<unknown>, value: unknown) {
	if (builder.add_expr_value.length === 1) {
		return (builder as Gda6.SqlBuilder).add_expr_value(value as GObject.Value);
	} else {
		return (builder as Gda5.SqlBuilder).add_expr_value(null, value as GObject.Value);
	}
}

export function convert_datetime(datetime: GLib.DateTime): string {
	return datetime.to_utc()!.format('%Y-%m-%d %H:%M:%S')!;
}

// Unescape null values in sql since Gda.Null is not supported in gda 5
export function unescape_sql(
	connection: Gda5.Connection,
	builder: Gda5.SqlBuilder | SqlBuilder<unknown>,
): Gda5.Statement {
	const bstmt = builder.get_statement();
	const sql = connection.statement_to_sql(bstmt, bstmt.get_parameters()[1], null)[0];

	const unescapedSql = sql.replace(/(?<!')'NULL'(?!')/g, 'NULL');
	return connection.parse_sql_string(unescapedSql)[0];
}

export function async_statement_execute_select<T>(
	Gda: typeof Gda5 | typeof Gda6,
	connection: Gda5.Connection | Gda6.Connection,
	statement: Gda5.Statement | Gda6.Statement,
	cancellable: Gio.Cancellable,
): Promise<DataModel<T>> {
	return new Promise((resolve, reject) => {
		if ('async_statement_execute' in connection) {
			// Gda 5
			const id = connection.async_statement_execute(
				statement as Gda5.Statement,
				null,
				Gda.StatementModelUsage.RANDOM_ACCESS,
				null,
				false,
			);

			let i = 0;
			const timeoutId = GLib.timeout_add(GLib.PRIORITY_HIGH, 100, () => {
				try {
					const [result] = connection.async_fetch_result(id);
					if (result) {
						if (result instanceof Gda.DataModel) {
							resolve(result as DataModel<T>);
						} else {
							reject(new Error('Statement is not a selection statement'));
						}
						cancellable.disconnect(cancellableId);
						return GLib.SOURCE_REMOVE;
					}

					if (i >= 10) {
						reject(new Error('Timeout'));
						cancellable.disconnect(cancellableId);
						return GLib.SOURCE_REMOVE;
					}

					i++;
					cancellable.disconnect(cancellableId);
					return GLib.SOURCE_CONTINUE;
				} catch (error) {
					reject(error as Error);
					cancellable.disconnect(cancellableId);
					return GLib.SOURCE_REMOVE;
				}
			});

			const cancellableId = cancellable.connect(() => GLib.source_remove(timeoutId));
		} else {
			// Gda 6
			GLib.idle_add(GLib.PRIORITY_HIGH, () => {
				try {
					const datamodel = connection.statement_execute_select(statement as Gda6.Statement, null);
					resolve(datamodel as unknown as DataModel<T>);
				} catch (error) {
					reject(error as Error);
				}

				return GLib.SOURCE_REMOVE;
			});
		}
	});
}

export function async_statement_execute_non_select(
	Gda: typeof Gda5 | typeof Gda6,
	connection: Gda5.Connection | Gda6.Connection,
	statement: Gda5.Statement | Gda6.Statement,
	cancellable: Gio.Cancellable,
): Promise<[number, Gda5.Set | Gda6.Set | null]> {
	return new Promise((resolve, reject) => {
		if ('async_statement_execute' in connection) {
			// Gda 5
			const id = connection.async_statement_execute(
				statement as Gda5.Statement,
				null,
				Gda.StatementModelUsage.RANDOM_ACCESS,
				null,
				true,
			);

			let i = 0;
			const timeoutId = GLib.timeout_add(GLib.PRIORITY_HIGH, 100, () => {
				try {
					const [result, lastRow] = connection.async_fetch_result(id);
					if (result) {
						if (result instanceof Gda.Set) {
							const rows = result.get_holder_value('IMPACTED_ROWS') as number | null;
							resolve([rows ?? -2, lastRow]);
						} else {
							reject(new Error('Statement is a selection statement'));
						}
						cancellable.disconnect(cancellableId);
						return GLib.SOURCE_REMOVE;
					}

					if (i >= 10) {
						reject(new Error('Timeout'));
						cancellable.disconnect(cancellableId);
						return GLib.SOURCE_REMOVE;
					}

					i++;
					cancellable.disconnect(cancellableId);
					return GLib.SOURCE_CONTINUE;
				} catch (error) {
					reject(error as Error);
					cancellable.disconnect(cancellableId);
					return GLib.SOURCE_REMOVE;
				}
			});

			const cancellableId = cancellable.connect(() => GLib.source_remove(timeoutId));
		} else {
			// Gda 6
			GLib.idle_add(GLib.PRIORITY_HIGH, () => {
				try {
					const result = connection.statement_execute_non_select(statement as Gda6.Statement, null);
					resolve(result);
				} catch (error) {
					reject(error as Error);
				}

				return GLib.SOURCE_REMOVE;
			});
		}
	});
}
