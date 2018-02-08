import * as assert from 'assert';
import { connection, Transaction } from './config/mangoInstance';
import Person, { IPersonDocument } from './config/Person';
import Wallet, { IWalletDocument } from './config/Wallet';

describe('All in a transaction', () => {
  it('drop database', async () => {
    await connection.dropDatabase();
  });
  it('should ok', async () => {
    let { person, wallet } = await Transaction.try(async t => {
      // Create a person
      const p = await Person.create({
        name: 'Misery',
        gender: 'male',
        profile: {
          nickname: 'Mis',
        },
        __t: t, // Inject transaction
      });
      // Update nickname
      await Person.findByIdAndUpdate(p._id, {
        $set: {
          'profile.nickname': 'Luna',
        },
      }, {
        __t: t,
      });
      // Unset gender
      await Person.findByIdAndUpdate(p._id, {
        $unset: { gender: 1 },
      }, {
        __t: t,
      });
      // Create a wallet
      const w = await Wallet.create({
        person: p._id,
        __t: t,
      });
      // Recharge it
      w.__t = t;
      w.money += 100;
      await w.save();
      return {
        person: p,
        wallet: w,
      };
    }, 'create a person with wallet recharged.');

    assert(person);
    assert(wallet);

    person = await Person.findById(person._id) as IPersonDocument;
    wallet = await Wallet.findById(wallet._id) as IWalletDocument;

    assert(person.name === 'Misery');
    assert(person.profile.nickname === 'Luna');
    assert(!person.gender);
    assert(wallet.person.toString() === person._id.toString());
    assert(wallet.money === 100);
  });
});

after(async () => {
  connection.close();
});
