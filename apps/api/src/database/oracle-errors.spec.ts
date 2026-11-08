import { BadRequestException } from '@nestjs/common';
import { mapOracleError, oracleErrorNumber } from './oracle-errors';

describe('Oracle error mapping', () => {
  it('maps pkg_screening business errors to HTTP 400 with a Vietnamese message', () => {
    const cases = [
      [20401, 'INVALID_YEAR'],
      [20402, 'INVALID_CONDITIONS'],
      [20403, 'UNKNOWN_METRIC'],
      [20404, 'INVALID_OPERATOR'],
      [20405, 'INVALID_THRESHOLD'],
    ] as const;
    for (const [num, code] of cases) {
      const http = mapOracleError({ errorNum: num, message: `ORA-${num}: x` });
      expect(http).toBeInstanceOf(BadRequestException);
      expect((http?.getResponse() as { code: string }).code).toBe(code);
    }
  });

  it('reads the error number from the message when errorNum is missing', () => {
    expect(oracleErrorNumber({ message: 'ORA-20403: Unknown metric' })).toBe(20403);
  });

  it('leaves other Oracle errors unmapped so they become a generic 500', () => {
    expect(mapOracleError({ errorNum: 942, message: 'ORA-00942: table or view does not exist' })).toBeNull();
    expect(mapOracleError(new Error('socket hang up'))).toBeNull();
  });
});
