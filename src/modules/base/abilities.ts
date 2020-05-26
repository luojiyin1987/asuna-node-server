import { BaseEntity, Column } from 'typeorm';
import { MetaInfo } from '../common/decorators';

export type Constructor<T = {}> = new (...args: any[]) => T;

export const Publishable = <TBase extends Constructor<BaseEntity>>(Base: TBase): TBase & { isPublished?: boolean } => {
  class ExtendableEntity extends Base {
    @MetaInfo({ name: '是否发布？' })
    @Column({ nullable: true, name: 'is_published' })
    isPublished: boolean;
  }

  return ExtendableEntity;
};

export const NameDescAttachable = <TBase extends Constructor<BaseEntity>>(
  Base: TBase,
): TBase & { name: string; description?: string } => {
  class ExtendableEntity extends Base {
    @MetaInfo({ name: '名称' })
    @Column({ nullable: false, length: 100, unique: true, name: 'name' })
    name: string;

    @MetaInfo({ name: '描述' })
    @Column('text', { nullable: true, name: 'description' })
    description: string;
  }
  return ExtendableEntity;
};
