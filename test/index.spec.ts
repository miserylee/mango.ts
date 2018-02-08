import * as assert from 'assert';
import { IObjectId } from '../src';
import { connection, Transaction } from './config/mangoInstance';
import Person, { IPersonDocument } from './config/Person';
import Wallet from './config/Wallet';

describe('Transaction', () => {
  it('drop database', async () => {
    await connection.dropDatabase();
  });
  let person: IPersonDocument;
  it('create a person', async () => {
    person = await createAPerson();
  });
  it('update nickname', async () => {
    await updateNickName(person._id);
  });
  it('unset person gender', async () => {
    await unsetPersonGender(person._id);
  });
  it('create a wallet and recharge', async () => {
    await createAWalletAndRecharge(person._id);
  });
  it('close connection', async () => {
    await connection.close();
  });
});

async function createAPerson(): Promise<IPersonDocument> {
  const p = await Transaction.try(async t => {
    return await Person.create({
      name: 'Misery',
      gender: 'male',
      profile: {
        nickname: 'Mis',
      },
      __t: t, // Inject transaction
    });
  }, 'create a person');

  const person = await Person.findById(p._id);
  assert(person);
  if (person) {
    assert(person.name === 'Misery');
    assert(person.gender === 'male');
    assert(person.profile.nickname === 'Mis');
  }
  return person as IPersonDocument;
}

async function updateNickName(id: IObjectId) {
  await Transaction.try(async t => {
    await Person.findByIdAndUpdate(id, {
      $set: { 'profile.nickname': 'Luna' },
    }, {
      __t: t,
    });
  }, 'update nickname');

  const person = await Person.findById(id);
  assert(person);
  if (person) {
    assert(person.name === 'Misery');
    assert(person.profile.nickname === 'Luna');
  }
}

async function unsetPersonGender(id: IObjectId) {
  await Transaction.try(async t => {
    await Person.findByIdAndUpdate(id, {
      $unset: { gender: 1 },
    }, {
      __t: t,
    });
  }, 'unset person gender');

  const person = await Person.findById(id);
  assert(person);
  if (person) {
    assert(person.name === 'Misery');
    assert(!person.gender);
  }
}

async function createAWalletAndRecharge(persnId: IObjectId) {
  let wallet = await Transaction.try(async t => {
    const person = await Person.findById(persnId);
    assert(person);
    if (!person) {
      return null;
    }
    const w = await Wallet.create({
      person: person._id,
      __t: t,
    });
    return await Wallet.findByIdAndUpdate(w._id, {
      $set: {
        money: 100,
      },
    }, {
      __t: t,
    });
  }, 'create wallet and recharge');

  if (wallet) {
    wallet = await Wallet.findById(wallet._id);
    assert(wallet);
    if (wallet) {
      assert(wallet.person.toString() === persnId.toString());
      assert(wallet.money === 100);
    }
  }
}

after(async () => {
  connection.close();
});
